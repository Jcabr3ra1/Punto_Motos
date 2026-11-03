import uuid
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Role
from apps.cash.models import (
    CashDifferenceUnexplained, CashMovement, CashMovementKind, CashSession, CashSessionAlreadyOpen,
    CashSessionClosed,
)
from apps.consignments.models import Consignee, ConsigneePayment
from apps.core.models import PaymentMethod
from apps.inventory.models import InventoryMovement, MovementKind
from apps.purchases.models import Supplier, SupplierPayment
from apps.sales.models import Customer, Sale, SaleAlreadyVoided

from .helpers import make_user, open_cash
from .test_catalog_models import make_product
from .test_purchases_models import make_purchase
from .test_sales_models import finish_initial_count, stock_of

CASH, TRANSFER = PaymentMethod.CASH, PaymentMethod.TRANSFER


class CashTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("vendedor")
        self.product = make_product(cost_price=18000, sale_price=25000)
        InventoryMovement.objects.record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        finish_initial_count(self.owner)
        self.customer = Customer.objects.create(name="Juan Pérez")
        self.session = open_cash(self.owner, opening_cash=100000)

    def sell(self, quantity=1, payments=None):
        payments = payments or [{"amount": 25000 * quantity, "method": CASH}]
        return Sale.objects.confirm(
            self.customer, [{"product": self.product, "quantity": quantity}], payments, self.seller, uuid.uuid4(),
        )[0]


class CashSessionTests(CashTestCase):
    def test_only_one_open(self):
        with self.assertRaises(CashSessionAlreadyOpen):
            CashSession.objects.open(0, self.owner)

    def test_database_rejects_two_open(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            CashSession.objects.create(opening_cash=0, opened_by=self.owner)

    def test_expected_cash_counts_only_cash(self):
        self.sell(payments=[{"amount": 10000, "method": CASH}, {"amount": 15000, "method": TRANSFER}])
        CashMovement.objects.spend(CashMovementKind.EXPENSE, 3000, CASH, self.owner, "Almuerzo")
        CashMovement.objects.spend(CashMovementKind.OWNER_WITHDRAWAL, 20000, CASH, self.owner, "Retiro")

        self.assertEqual(self.session.current_expected_cash, 100000 + 10000 - 3000 - 20000)
        self.assertEqual(self.session.total(TRANSFER), 15000)

    def test_close_that_matches(self):
        self.sell()

        self.session.close(125000, self.owner)

        self.assertFalse(self.session.is_open)
        self.assertEqual((self.session.expected_cash, self.session.difference), (125000, 0))
        self.assertIsNone(CashSession.objects.current())

    def test_difference_needs_explanation(self):
        with self.assertRaises(CashDifferenceUnexplained):
            self.session.close(99000, self.owner)

        self.session.close(99000, self.owner, notes="  Faltó  sencillo ")
        self.assertEqual((self.session.difference, self.session.closing_notes), (-1000, "Faltó sencillo"))

    def test_cannot_close_twice(self):
        self.session.close(100000, self.owner)

        with self.assertRaises(CashSessionClosed):
            self.session.close(100000, self.owner)

    def test_a_new_one_opens_after_closing(self):
        self.session.close(100000, self.owner)

        self.assertTrue(CashSession.objects.open(100000, self.owner).is_open)

    def test_expense_needs_reason(self):
        with self.assertRaises(ValidationError):
            CashMovement.objects.spend(CashMovementKind.EXPENSE, 3000, CASH, self.owner, "  ")

    def test_only_expenses_and_withdrawals_are_manual(self):
        with self.assertRaises(ValueError):
            CashMovement.objects.spend(CashMovementKind.SALE, 3000, CASH, self.owner, "Venta")


class MoneyNeedsOpenCashTests(CashTestCase):
    def setUp(self):
        super().setUp()
        self.session.close(100000, self.owner)

    def test_no_sale_without_cash(self):
        with self.assertRaises(CashSessionClosed):
            self.sell()

        self.assertFalse(Sale.objects.exists())
        self.assertEqual(stock_of(self.product), 5)

    def test_no_expense_without_cash(self):
        with self.assertRaises(CashSessionClosed):
            CashMovement.objects.spend(CashMovementKind.EXPENSE, 3000, CASH, self.owner, "Almuerzo")


class PaymentsGoToCashTests(CashTestCase):
    def test_sale_payments_enter_by_method(self):
        sale = self.sell(payments=[{"amount": 10000, "method": CASH}, {"amount": 15000, "method": TRANSFER}])

        self.assertEqual(
            sorted(sale.cash_movements.values_list("kind", "method", "amount")),
            [("sale", "cash", 10000), ("sale", "transfer", 15000)],
        )

    def test_supplier_payment_today_leaves_cash(self):
        supplier = Supplier.objects.create(name="Distribuidora Andina")
        purchase = make_purchase(self.owner, supplier=supplier, items=[(self.product, 2, 10000)])
        purchase.receive(self.owner, payment={"amount": 5000, "method": CASH})

        movement = CashMovement.objects.get(kind=CashMovementKind.SUPPLIER_PAYMENT)
        self.assertEqual((movement.amount, movement.reason), (-5000, "Abono a Distribuidora Andina"))
        self.assertEqual(self.session.current_expected_cash, 95000)

    def test_backdated_supplier_payment_does_not_touch_cash(self):
        supplier = Supplier.objects.create(name="Distribuidora Andina")
        make_purchase(self.owner, supplier=supplier, items=[(self.product, 2, 10000)]).receive(self.owner)
        self.session.close(100000, self.owner)

        SupplierPayment.objects.record(
            supplier, 5000, CASH, self.owner, paid_on=timezone.localdate() - timedelta(days=3),
        )

        self.assertFalse(CashMovement.objects.filter(kind=CashMovementKind.SUPPLIER_PAYMENT).exists())

    def test_supplier_payment_today_without_cash_leaves_nothing(self):
        supplier = Supplier.objects.create(name="Distribuidora Andina")
        purchase = make_purchase(self.owner, supplier=supplier, items=[(self.product, 2, 10000)])
        purchase.receive(self.owner)
        self.session.close(100000, self.owner)

        with self.assertRaises(CashSessionClosed):
            SupplierPayment.objects.record(supplier, 5000, CASH, self.owner)

        purchase.refresh_from_db()
        self.assertEqual(purchase.paid_amount, 0)
        self.assertFalse(SupplierPayment.objects.exists())

    def test_consignee_payment_enters_cash(self):
        shop = Consignee.objects.create(name="Motos El Paisa")
        Consignee.objects.filter(pk=shop.pk).update(balance_due=30000)

        ConsigneePayment.objects.record(shop, 30000, TRANSFER, self.owner)

        movement = CashMovement.objects.get(kind=CashMovementKind.CONSIGNEE_PAYMENT)
        self.assertEqual((movement.amount, movement.method), (30000, "transfer"))


class VoidSaleTests(CashTestCase):
    def test_returns_units_and_refunds_by_method(self):
        sale = self.sell(quantity=2, payments=[{"amount": 30000, "method": CASH}, {"amount": 20000, "method": TRANSFER}])

        sale.void(self.owner, "  Se cobró  al cliente equivocado ")

        self.assertTrue(sale.is_voided)
        self.assertEqual((sale.voided_by, sale.void_reason), (self.owner, "Se cobró al cliente equivocado"))
        self.assertEqual(stock_of(self.product), 5)
        returned = self.product.movements.get(kind=MovementKind.RETURN)
        self.assertEqual((returned.quantity, returned.unit_cost), (2, 18000))
        self.assertEqual(
            sorted(sale.cash_movements.filter(kind=CashMovementKind.SALE_REFUND).values_list("method", "amount")),
            [("cash", -30000), ("transfer", -20000)],
        )
        self.assertEqual(self.session.current_expected_cash, 100000)
        self.assertEqual(sale.items.count(), 1)

    def test_cannot_void_twice(self):
        sale = self.sell()
        sale.void(self.owner, "Error")

        with self.assertRaises(SaleAlreadyVoided):
            Sale.objects.get(pk=sale.pk).void(self.owner, "Otra vez")
        self.assertEqual(stock_of(self.product), 5)

    def test_needs_reason(self):
        sale = self.sell()

        with self.assertRaises(ValidationError):
            sale.void(self.owner, " ")
        sale.refresh_from_db()
        self.assertFalse(sale.is_voided)

    def test_refund_goes_to_todays_cash(self):
        sale = self.sell()
        self.session.close(125000, self.owner)
        today = open_cash(self.owner, opening_cash=125000)

        sale.void(self.owner, "Devolvió todo")

        self.assertEqual(today.current_expected_cash, 100000)

    def test_needs_open_cash(self):
        sale = self.sell()
        self.session.close(125000, self.owner)

        with self.assertRaises(CashSessionClosed):
            sale.void(self.owner, "Error")
        sale.refresh_from_db()
        self.assertFalse(sale.is_voided)
        self.assertEqual(stock_of(self.product), 4)
