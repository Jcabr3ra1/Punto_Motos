import uuid

from django.core.exceptions import ValidationError
from django.db.models import Sum
from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind, CashSession, CashSessionClosed
from apps.core.models import PaymentMethod
from apps.inventory.models import InventoryMovement, MovementKind
from apps.sales.models import (
    BadServiceOwnerOnly,
    EmptyReturn,
    RefundMismatch,
    ReturnCause,
    ReturnCondition,
    ReturnExceedsSold,
    SaleAlreadyVoided,
    SaleHasReturns,
    SaleIsFinal,
    SaleReturn,
    ServiceAlreadyReturned,
)
from apps.workshop.models import MechanicDeduction, MechanicSettlement

from .test_sales_models import stock_of
from .test_workshop_models import WorkshopSalesTestCase, make_service_type


class ReturnsTestCase(WorkshopSalesTestCase):
    def setUp(self):
        super().setUp()
        self.today = timezone.localdate()
        # Servicio de 15.000 con Carlos y dos pastillas de 25.000.
        self.sale, _ = self.sell(
            items=[{"product": self.brakes, "quantity": 2}],
            services=[{"service_type": self.oil, "mechanic": self.carlos}],
        )
        self.item = self.sale.items.get()
        self.service = self.sale.services.get()

    def give_back(self, items=(), services=(), cause=ReturnCause.OTHER, user=None, key=None, refunds=None, sale=None):
        """Sin refunds, reembolsa el total en efectivo."""
        if refunds is None:
            total = sum(line["sale_item"].unit_price * line["quantity"] for line in items)
            total += sum(service.labor_price for service in services)
            refunds = [{"method": PaymentMethod.CASH, "amount": total}] if total else []
        return SaleReturn.objects.register(
            sale or self.sale, cause, "El cliente reclamó", user or self.owner, key or uuid.uuid4(),
            items=list(items), services=list(services), refunds=refunds,
        )

    def line(self, quantity=1, condition=ReturnCondition.RESELLABLE):
        return {"sale_item": self.item, "quantity": quantity, "condition": condition}


class PartialReturnTests(ReturnsTestCase):
    def test_resellable_unit_goes_back_to_stock_and_money_leaves_cash(self):
        before = stock_of(self.brakes)

        sale_return, created = self.give_back(items=[self.line()])

        self.assertTrue(created)
        self.assertEqual((sale_return.number, sale_return.total), (1, 25000))
        self.assertEqual(stock_of(self.brakes), before + 1)
        movement = self.brakes.movements.get(kind=MovementKind.RETURN)
        self.assertEqual((movement.quantity, movement.unit_cost), (1, 18000))
        refund = CashMovement.objects.get(kind=CashMovementKind.SALE_REFUND)
        self.assertEqual((refund.amount, refund.sale, refund.sale_return), (-25000, self.sale, sale_return))
        self.item.refresh_from_db()
        self.assertEqual(self.item.returned_quantity, 1)

    def test_damaged_unit_is_noted_but_does_not_enter_stock(self):
        before = stock_of(self.brakes)

        self.give_back(items=[self.line(condition=ReturnCondition.DAMAGED)])

        self.assertEqual(stock_of(self.brakes), before)
        self.assertFalse(InventoryMovement.objects.filter(kind=MovementKind.RETURN).exists())
        self.assertTrue(CashMovement.objects.filter(kind=CashMovementKind.SALE_REFUND, amount=-25000).exists())

    def test_refunds_the_price_charged_not_todays_catalog_price(self):
        self.brakes.sale_price = 99000
        self.brakes.save()

        sale_return, _ = self.give_back(items=[self.line()])

        self.assertEqual(sale_return.total, 25000)

    def test_cannot_return_more_than_sold_minus_previous_returns(self):
        self.give_back(items=[self.line()])
        before = stock_of(self.brakes)

        with self.assertRaises(ReturnExceedsSold) as raised:
            self.give_back(items=[self.line(quantity=2)])

        self.assertEqual((raised.exception.available, raised.exception.requested), (1, 2))
        self.assertEqual(stock_of(self.brakes), before)
        self.assertEqual(SaleReturn.objects.count(), 1)
        self.assertEqual(CashMovement.objects.filter(kind=CashMovementKind.SALE_REFUND).count(), 1)
        self.give_back(items=[self.line()])  # la que falta sí se puede

    def test_refund_must_match_and_can_be_split_by_method(self):
        with self.assertRaises(RefundMismatch):
            self.give_back(items=[self.line()], refunds=[{"method": PaymentMethod.CASH, "amount": 1}])
        self.assertFalse(SaleReturn.objects.exists())

        sale_return, _ = self.give_back(items=[self.line()], refunds=[
            {"method": PaymentMethod.CASH, "amount": 5000}, {"method": PaymentMethod.TRANSFER, "amount": 20000},
        ])

        self.assertEqual(sale_return.refunds.count(), 2)
        self.assertEqual(sale_return.cash_movements.aggregate(total=Sum("amount"))["total"], -25000)

    def test_same_key_does_not_repeat_the_return(self):
        key = uuid.uuid4()
        first, created = self.give_back(items=[self.line()], key=key)
        before = stock_of(self.brakes)

        again, created_again = self.give_back(items=[self.line()], key=key)

        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first, again)
        self.assertEqual(stock_of(self.brakes), before)

    def test_rejects_empty_foreign_or_repeated_lines(self):
        other_sale, _ = self.sell(items=[{"product": self.plug, "quantity": 1}])

        with self.assertRaises(EmptyReturn):
            self.give_back()
        with self.assertRaises(ValidationError):
            self.give_back(items=[{"sale_item": other_sale.items.get(), "quantity": 1}])
        with self.assertRaises(ValidationError):
            self.give_back(items=[self.line(), self.line()])
        with self.assertRaises(ValidationError):
            self.give_back(items=[self.line(quantity=0)])

    def test_needs_reason_open_cash_and_a_sale_not_voided(self):
        with self.assertRaises(ValidationError):
            SaleReturn.objects.register(
                self.sale, ReturnCause.OTHER, "   ", self.owner, uuid.uuid4(), items=[self.line()],
                refunds=[{"method": PaymentMethod.CASH, "amount": 25000}],
            )

        other_sale, _ = self.sell(items=[{"product": self.plug, "quantity": 1}])
        other_sale.void(self.owner, "Error")
        with self.assertRaises(SaleAlreadyVoided):
            self.give_back(sale=other_sale, items=[{"sale_item": other_sale.items.get(), "quantity": 1}])

        CashSession.objects.current().close(CashSession.objects.current().current_expected_cash, self.owner)
        with self.assertRaises(CashSessionClosed):
            self.give_back(items=[self.line()])

    def test_is_final_and_blocks_voiding_the_sale(self):
        sale_return, _ = self.give_back(items=[self.line()])

        with self.assertRaises(SaleIsFinal):
            sale_return.delete()
        with self.assertRaises(SaleHasReturns):
            self.sale.void(self.owner, "Ya no")
        self.sale.refresh_from_db()
        self.assertFalse(self.sale.is_voided)


class OtherCauseServiceTests(ReturnsTestCase):
    def test_seller_can_register_it_and_mechanic_keeps_the_share(self):
        self.give_back(services=[self.service], user=self.seller)

        self.assertFalse(MechanicDeduction.objects.exists())
        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)
        self.assertEqual((settlement.deductions_total, settlement.amount), (0, 9000))

    def test_service_is_returned_only_once(self):
        self.give_back(services=[self.service])

        with self.assertRaises(ServiceAlreadyReturned):
            self.give_back(services=[self.service])
        self.assertEqual(SaleReturn.objects.count(), 1)
        self.assertEqual(CashMovement.objects.filter(kind=CashMovementKind.SALE_REFUND).count(), 1)


class BadServiceTests(ReturnsTestCase):
    def bad_service(self, items=(), services=None, user=None):
        return self.give_back(
            items=items, services=[self.service] if services is None else services, cause=ReturnCause.BAD_SERVICE,
            user=user,
        )

    def test_only_owner_can_register_it(self):
        with self.assertRaises(BadServiceOwnerOnly):
            self.bad_service(user=self.seller)
        self.assertFalse(SaleReturn.objects.exists())

    def test_deducts_all_labor_and_damaged_parts_but_not_resellable_ones(self):
        sale_return, _ = self.bad_service(items=[self.line(condition=ReturnCondition.DAMAGED)])

        self.assertEqual(sale_return.total, 40000)
        deduction = sale_return.mechanic_deduction
        self.assertEqual((deduction.mechanic, deduction.amount), (self.carlos, 40000))

    def test_resellable_part_is_refunded_without_deduction(self):
        sale_return, _ = self.bad_service(items=[self.line()])

        self.assertEqual(sale_return.total, 40000)
        self.assertEqual(sale_return.mechanic_deduction.amount, 15000)

    def test_needs_services_of_a_single_mechanic(self):
        two, _ = self.sell(services=[
            {"service_type": self.oil, "mechanic": self.carlos},
            {"service_type": self.oil, "mechanic": self.pedro},
        ])

        with self.assertRaises(ValidationError):
            self.give_back(sale=two, services=list(two.services.all()), cause=ReturnCause.BAD_SERVICE)
        with self.assertRaises(ValidationError):
            self.bad_service(items=[self.line()], services=[])
        self.assertFalse(SaleReturn.objects.exists())

    def test_also_works_after_paying_the_mechanic(self):
        MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        sale_return, _ = self.bad_service()

        self.assertEqual(sale_return.mechanic_deduction.pending_amount, 15000)


class SettlementWithDeductionTests(ReturnsTestCase):
    def setUp(self):
        super().setUp()
        self.big_job = make_service_type(code=300, name="Motor", suggested_price=100000)

    def bad_service(self):
        return self.give_back(services=[self.service], cause=ReturnCause.BAD_SERVICE)[0].mechanic_deduction

    def test_discounts_from_the_share_and_records_it(self):
        deduction = self.bad_service()                                       # 15.000 a descontar
        self.sell(services=[{"service_type": self.big_job, "mechanic": self.carlos}])    # 100.000 de mano de obra

        preview = MechanicSettlement.objects.preview(self.today)[0]
        settlement = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        # 115.000 × 60 % = 69.000; menos 15.000.
        self.assertEqual((preview["share"], preview["deductions_total"], preview["amount"]), (69000, 15000, 54000))
        self.assertEqual((settlement.deductions_total, settlement.amount), (15000, 54000))
        self.assertEqual(settlement.deduction_applications.get().deduction, deduction)
        payment = CashMovement.objects.get(kind=CashMovementKind.MECHANIC_PAYMENT)
        self.assertEqual(payment.amount, -54000)
        self.assertEqual(deduction.pending_amount, 0)
        self.assertFalse(MechanicDeduction.objects.pending(self.carlos).exists())

    def test_balance_passes_to_the_next_settlement(self):
        deduction = self.bad_service()    # 15.000 a descontar; su parte de hoy es 9.000

        first = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.assertEqual((first.deductions_total, first.amount), (9000, 0))
        self.assertFalse(CashMovement.objects.filter(kind=CashMovementKind.MECHANIC_PAYMENT).exists())
        self.assertEqual(deduction.pending_amount, 6000)

        self.sell(services=[{"service_type": self.big_job, "mechanic": self.carlos}])
        second = MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.assertEqual((second.deductions_total, second.amount), (6000, 54000))
        self.assertEqual(deduction.pending_amount, 0)

    def test_only_affects_that_mechanic(self):
        self.bad_service()
        self.sell(services=[{"service_type": self.oil, "mechanic": self.pedro}])

        settlement = MechanicSettlement.objects.settle(self.pedro, self.today, self.owner)

        self.assertEqual((settlement.deductions_total, settlement.amount), (0, 9000))

    def test_older_deductions_are_discounted_first(self):
        older = self.bad_service()
        second_sale, _ = self.sell(services=[{"service_type": self.oil, "mechanic": self.carlos}])
        newer = self.give_back(
            sale=second_sale, services=[second_sale.services.get()], cause=ReturnCause.BAD_SERVICE,
        )[0].mechanic_deduction

        # Mano de obra del día: 30.000; su parte, 18.000. Pendiente: 30.000.
        MechanicSettlement.objects.settle(self.carlos, self.today, self.owner)

        self.assertEqual((older.pending_amount, newer.pending_amount), (0, 12000))
