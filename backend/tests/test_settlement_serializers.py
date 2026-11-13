from datetime import timedelta

from rest_framework.exceptions import ValidationError

from apps.cash.exceptions import NoOpenCashSession
from apps.cash.models import CashSession
from apps.sales.exceptions import SaleSettled
from apps.sales.serializers import VoidSaleSerializer
from apps.workshop.exceptions import NothingPending
from apps.workshop.models import MechanicSettlement
from apps.workshop.serializers import SettleSerializer, SettlementPreviewSerializer

from .test_catalog_serializers import context_for
from .test_settlement_models import SettlementTestCase


class SettleSerializerTests(SettlementTestCase):
    def settle(self, data):
        serializer = SettleSerializer(data=data, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def test_pays_today_by_default_and_returns_services_for_the_sheet(self):
        sale = self.service_sale(self.carlos, items=[{"product": self.brakes, "quantity": 1}])
        self.sell(services=[{"service_type": self.oil, "mechanic": self.carlos}])

        data = self.settle({"mechanic": self.carlos.pk})

        self.assertEqual(data["date"], self.today.isoformat())
        self.assertEqual(data["mechanic"], {"id": self.carlos.pk, "name": "Carlos Ruiz"})
        self.assertEqual((data["labor_total"], data["percentage"], data["amount"]), (30000, 60, 18000))
        self.assertEqual((data["method"], data["method_label"], data["services_count"]), ("cash", "Efectivo", 2))
        first = data["services"][0]
        self.assertEqual(
            (first["sale_number"], first["customer"], first["service_type"]["code"], first["labor_price"]),
            (sale.number, "Juan Pérez", 101, 15000),
        )

    def test_pays_past_day_by_transfer(self):
        sale = self.service_sale(self.carlos)
        yesterday = self.today - timedelta(days=1)
        self.move_to(sale, yesterday)

        data = self.settle({"mechanic": self.carlos.pk, "date": yesterday.isoformat(), "method": "transfer"})

        self.assertEqual((data["date"], data["method"]), (yesterday.isoformat(), "transfer"))

    def test_future_day_is_rejected(self):
        serializer = SettleSerializer(
            data={"mechanic": self.carlos.pk, "date": (self.today + timedelta(days=1)).isoformat()},
            context=context_for(self.owner),
        )

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["date"], ["No se puede liquidar un día que no ha llegado."])

    def test_inactive_mechanic_is_still_paid(self):
        self.service_sale(self.carlos)
        self.carlos.is_active = False
        self.carlos.save()

        self.assertEqual(self.settle({"mechanic": self.carlos.pk})["amount"], 9000)

    def test_nothing_pending_is_a_conflict(self):
        self.service_sale(self.carlos)
        self.settle({"mechanic": self.carlos.pk})

        with self.assertRaises(NothingPending):
            self.settle({"mechanic": self.carlos.pk})
        with self.assertRaises(NothingPending):
            self.settle({"mechanic": self.pedro.pk})

    def test_closed_cash_is_a_conflict(self):
        self.service_sale(self.carlos)
        session = CashSession.objects.current()
        session.close(session.current_expected_cash, self.owner)

        with self.assertRaises(NoOpenCashSession):
            self.settle({"mechanic": self.carlos.pk})
        self.assertFalse(MechanicSettlement.objects.exists())

    def test_invalid_method_is_rejected(self):
        serializer = SettleSerializer(data={"mechanic": self.carlos.pk, "method": "card"}, context=context_for(self.owner))

        self.assertFalse(serializer.is_valid())
        self.assertIn("method", serializer.errors)


class PreviewSerializerTests(SettlementTestCase):
    def test_serializes_rows(self):
        sale = self.service_sale(self.carlos)
        service = sale.services.get()

        data = SettlementPreviewSerializer(MechanicSettlement.objects.preview(self.today), many=True).data

        self.assertEqual([dict(row) for row in data], [{
            "mechanic": {"id": self.carlos.pk, "name": "Carlos Ruiz"}, "services_count": 1, "labor_total": 15000,
            "percentage": 60, "share": 9000, "deductions_total": 0, "amount": 9000,
            "services": [{
                "id": service.pk,
                "sale_id": sale.pk,
                "sale_number": sale.number,
                "customer": "Juan Pérez",
                "service_type": {
                    "id": service.service_type_id,
                    "code": service.service_type.code,
                    "name": service.service_type.name,
                },
                "details": service.details,
                "labor_price": service.labor_price,
            }],
        }])


class VoidSettledSaleSerializerTests(SettlementTestCase):
    def test_voiding_sale_with_settled_service_is_a_conflict(self):
        sale = self.service_sale(self.carlos)
        MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)
        serializer = VoidSaleSerializer(sale, data={"reason": "Error"}, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(SaleSettled):
            serializer.save()

    def test_reason_is_still_validated_first(self):
        sale = self.service_sale(self.carlos)
        serializer = VoidSaleSerializer(sale, data={"reason": "  "}, context=context_for(self.owner))

        with self.assertRaises(ValidationError):
            serializer.is_valid(raise_exception=True)
