from datetime import datetime, timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind, CashSession, CashSessionClosed
from apps.core.models import PaymentMethod
from apps.sales.models import Sale, SaleHasSettledServices
from apps.workshop.models import Mechanic, MechanicSettlement, NothingToSettle, mechanic_share

from .test_workshop_models import WorkshopSalesTestCase, make_service_type


class MechanicShareTests(SimpleTestCase):
    def test_applies_percentage_and_rounds_to_nearest_peso(self):
        self.assertEqual(mechanic_share(100000, 60), 60000)
        self.assertEqual(mechanic_share(15001, 50), 7501)   # 7500,5 sube
        self.assertEqual(mechanic_share(15003, 50), 7502)   # 7501,5 sube
        self.assertEqual(mechanic_share(10001, 30), 3000)   # 3000,3 baja
        self.assertEqual(mechanic_share(50000, 0), 0)
        self.assertEqual(mechanic_share(50000, 100), 50000)


class SettlementTestCase(WorkshopSalesTestCase):
    def setUp(self):
        super().setUp()
        self.brakes_job = make_service_type(code=200, name="Frenos", suggested_price=25000)
        self.today = timezone.localdate()

    def service_sale(self, mechanic, service_type=None, items=()):
        sale, _ = self.sell(items=items, services=[{"service_type": service_type or self.oil, "mechanic": mechanic}])
        return sale

    def move_to(self, sale, day):
        """Cambia el día de la venta, como si se hubiera hecho antes."""
        moment = timezone.make_aware(datetime(day.year, day.month, day.day, 15, 0))
        Sale.objects.filter(pk=sale.pk).update(created_at=moment)


class SettleTests(SettlementTestCase):
    def test_pays_percentage_of_labor_only_not_parts(self):
        self.service_sale(self.carlos, items=[{"product": self.brakes, "quantity": 1}])   # 15.000 + repuesto 25.000
        self.service_sale(self.carlos, service_type=self.brakes_job)                      # 25.000

        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.assertEqual((settlement.labor_total, settlement.percentage, settlement.amount), (40000, 60, 24000))
        self.assertEqual(settlement.services.count(), 2)
        payment = CashMovement.objects.get(kind=CashMovementKind.MECHANIC_PAYMENT)
        self.assertEqual((payment.amount, payment.method), (-24000, PaymentMethod.CASH))
        self.assertEqual(payment.mechanic_settlement, settlement)
        self.assertEqual(payment.reason, f"Liquidación {self.today:%Y-%m-%d} · Carlos Ruiz")

    def test_uses_mechanic_own_percentage_and_keeps_it(self):
        self.carlos.labor_percentage = 70
        self.carlos.save()
        self.service_sale(self.carlos)

        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)
        self.carlos.labor_percentage = 50
        self.carlos.save()

        settlement.refresh_from_db()
        self.assertEqual((settlement.percentage, settlement.amount), (70, 10500))

    def test_only_counts_that_mechanic_and_that_day(self):
        self.service_sale(self.carlos)
        self.service_sale(self.pedro, service_type=self.brakes_job)
        yesterday_sale = self.service_sale(self.carlos, service_type=self.brakes_job)
        self.move_to(yesterday_sale, self.today - timedelta(days=1))

        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.assertEqual(settlement.labor_total, 15000)

    def test_voided_services_do_not_count(self):
        self.service_sale(self.carlos)
        voided = self.service_sale(self.carlos, service_type=self.brakes_job)
        voided.void(self.owner, "Se registró dos veces")

        self.assertEqual(MechanicSettlement.objects.settle(self.carlos, self.today, self.owner).labor_total, 15000)

    def test_service_is_never_paid_twice_and_later_services_are_settled_apart(self):
        self.service_sale(self.carlos)
        MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        with self.assertRaises(NothingToSettle):
            MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.service_sale(self.carlos, service_type=self.brakes_job)
        second = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)
        self.assertEqual(second.labor_total, 25000)
        self.assertEqual(CashMovement.objects.filter(kind=CashMovementKind.MECHANIC_PAYMENT).count(), 2)

    def test_past_day_is_paid_from_todays_cash(self):
        sale = self.service_sale(self.carlos)
        yesterday = self.today - timedelta(days=1)
        self.move_to(sale, yesterday)

        settlement = MechanicSettlement.objects.settle(self.carlos, yesterday, self.owner, method=PaymentMethod.TRANSFER)

        self.assertEqual(settlement.date, yesterday)
        payment = settlement.cash_movements.get()
        self.assertEqual((payment.session, payment.method), (CashSession.objects.current(), PaymentMethod.TRANSFER))

    def test_future_day_is_rejected(self):
        with self.assertRaises(ValidationError) as error:
            MechanicSettlement.objects.settle(self.carlos, self.today + timedelta(days=1), self.owner)
        self.assertIn("date", error.exception.message_dict)

    def test_needs_open_cash_and_leaves_nothing_without_it(self):
        self.service_sale(self.carlos)
        session = CashSession.objects.current()
        session.close(session.current_expected_cash, self.owner)

        with self.assertRaises(CashSessionClosed):
            MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)
        self.assertFalse(MechanicSettlement.objects.exists())
        self.assertFalse(self.carlos.services.filter(settlement__isnull=False).exists())

    def test_zero_percentage_settles_without_cash_movement(self):
        self.carlos.labor_percentage = 0
        self.carlos.save()
        self.service_sale(self.carlos)

        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.assertEqual(settlement.amount, 0)
        self.assertFalse(settlement.cash_movements.exists())

    def test_amount_cannot_exceed_labor(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            MechanicSettlement.objects.create(
                mechanic=self.carlos, date=self.today, labor_total=1000, percentage=60, amount=1001,
                method=PaymentMethod.CASH, created_by=self.owner,
            )


class PreviewTests(SettlementTestCase):
    def test_shows_pending_by_mechanic_before_paying(self):
        self.service_sale(self.carlos)
        self.service_sale(self.carlos, service_type=self.brakes_job)
        self.service_sale(self.pedro)
        Mechanic.objects.create(name="Sin servicios")

        preview = MechanicSettlement.objects.preview(self.today)

        self.assertEqual(
            [(row["mechanic"].name, row["services_count"], row["labor_total"], row["percentage"], row["amount"])
             for row in preview],
            [("Carlos Ruiz", 2, 40000, 60, 24000), ("Pedro Gómez", 1, 15000, 60, 9000)],
        )
        MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)
        self.assertEqual([row["mechanic"].name for row in MechanicSettlement.objects.preview(self.today)], ["Pedro Gómez"])


class VoidSettledSaleTests(SettlementTestCase):
    def test_sale_with_settled_service_cannot_be_voided(self):
        sale = self.service_sale(self.carlos, items=[{"product": self.brakes, "quantity": 1}])
        MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        with self.assertRaises(SaleHasSettledServices):
            sale.void(self.owner, "El cliente se arrepintió")
        sale.refresh_from_db()
        self.assertFalse(sale.is_voided)
        self.assertFalse(CashMovement.objects.filter(kind=CashMovementKind.SALE_REFUND).exists())
