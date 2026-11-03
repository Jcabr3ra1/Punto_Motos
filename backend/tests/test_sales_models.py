import uuid

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Role
from apps.core.models import PaymentMethod
from apps.inventory.models import InitialCount, InsufficientStock, InventoryBalance, InventoryMovement, MovementKind
from apps.sales.models import (
    Customer, EmptySale, InitialCountOpen, PaymentMismatch, PriceChangeNotAllowed, Sale, SaleIsFinal, SaleItem,
)

from .helpers import make_user, open_cash
from .test_catalog_models import make_product


def finish_initial_count(user):
    InitialCount.objects.update_or_create(pk=InitialCount.SINGLETON_PK, defaults={
        "finished_at": timezone.now(), "finished_by": user,
    })


def stock_of(product):
    return InventoryBalance.objects.get(product=product).quantity


class SalesTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.seller = make_user("vendedor")
        self.brakes = make_product(cost_price=18000, sale_price=25000)
        self.plug = make_product(code="ELE-UNI-BUJ", name="Bujía NGK", cost_price=9000, sale_price=14000)
        InventoryMovement.objects.record(self.brakes, MovementKind.INITIAL_COUNT, 5, self.owner)
        InventoryMovement.objects.record(self.plug, MovementKind.INITIAL_COUNT, 10, self.owner)
        finish_initial_count(self.owner)
        self.customer = Customer.objects.create(name="Juan Pérez")

    def sell(self, items, user=None, payments=None, key=None, customer=None):
        """Sin payments, paga el total en efectivo."""
        if payments is None:
            total = sum(item.get("unit_price", item["product"].sale_price) * item["quantity"] for item in items)
            payments = [{"amount": total, "method": PaymentMethod.CASH}] if total else []
        return Sale.objects.confirm(customer or self.customer, items, payments, user or self.seller, key or uuid.uuid4())


class CustomerTests(TestCase):
    def test_name_can_repeat(self):
        Customer.objects.create(name="Juan Pérez")
        Customer.objects.create(name="juan pérez")

        self.assertEqual(Customer.objects.count(), 2)

    def test_search_name_has_no_accents(self):
        customer = Customer.objects.create(name="  José   Muñoz ")

        self.assertEqual(customer.name, "José Muñoz")
        self.assertEqual(customer.search_name, "jose munoz")


class ConfirmSaleTests(SalesTestCase):
    def test_takes_price_and_cost_from_catalog_and_discounts_stock(self):
        sale, created = self.sell([{"product": self.brakes, "quantity": 2}, {"product": self.plug, "quantity": 1}])

        self.assertTrue(created)
        self.assertEqual(sale.number, 1)
        self.assertEqual(sale.total, 2 * 25000 + 14000)
        line = sale.items.get(product=self.brakes)
        self.assertEqual((line.list_price, line.unit_price, line.unit_cost), (25000, 25000, 18000))
        self.assertEqual(line.description, "FRE-PUL-PAS · Pastillas de freno Pulsar 180")
        self.assertFalse(line.price_changed)
        self.assertEqual(stock_of(self.brakes), 3)
        self.assertEqual(stock_of(self.plug), 9)
        movement = self.brakes.movements.get(kind=MovementKind.SALE)
        self.assertEqual((movement.quantity, movement.unit_cost), (-2, 18000))
        self.assertEqual(movement.reason, "Venta 1 · Juan Pérez")

    def test_numbers_are_consecutive(self):
        first, _ = self.sell([{"product": self.plug, "quantity": 1}])
        second, _ = self.sell([{"product": self.plug, "quantity": 1}])

        self.assertEqual((first.number, second.number), (1, 2))

    def test_catalog_change_does_not_alter_past_sale(self):
        sale, _ = self.sell([{"product": self.brakes, "quantity": 1}])
        self.brakes.sale_price = 30000
        self.brakes.save()

        self.assertEqual(sale.items.get().unit_price, 25000)

    def test_same_key_returns_the_same_sale(self):
        key = uuid.uuid4()
        sale, _ = self.sell([{"product": self.brakes, "quantity": 2}], key=key)
        again, created = self.sell([{"product": self.brakes, "quantity": 2}], key=key)

        self.assertFalse(created)
        self.assertEqual(again.pk, sale.pk)
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(stock_of(self.brakes), 3)

    def test_not_enough_stock_leaves_nothing(self):
        with self.assertRaises(InsufficientStock):
            self.sell([{"product": self.plug, "quantity": 1}, {"product": self.brakes, "quantity": 6}])

        self.assertFalse(Sale.objects.exists())
        self.assertEqual(stock_of(self.plug), 10)

    def test_empty_sale_is_rejected(self):
        with self.assertRaises(EmptySale):
            self.sell([])

    def test_cannot_sell_while_initial_count_is_open(self):
        InitialCount.objects.filter(pk=InitialCount.SINGLETON_PK).update(finished_at=None, finished_by=None)

        with self.assertRaises(InitialCountOpen):
            self.sell([{"product": self.plug, "quantity": 1}])

    def test_seller_cannot_change_price(self):
        with self.assertRaises(PriceChangeNotAllowed):
            self.sell([{"product": self.brakes, "quantity": 1, "unit_price": 20000}])

        self.assertFalse(Sale.objects.exists())

    def test_seller_can_send_the_catalog_price(self):
        sale, _ = self.sell([{"product": self.brakes, "quantity": 1, "unit_price": 25000}])

        self.assertEqual(sale.total, 25000)

    def test_owner_can_change_price_and_it_stays_on_the_line(self):
        sale, _ = self.sell([{"product": self.brakes, "quantity": 2, "unit_price": 22000}], user=self.owner)

        line = sale.items.get()
        self.assertEqual((line.list_price, line.unit_price), (25000, 22000))
        self.assertTrue(line.price_changed)
        self.assertEqual(sale.total, 44000)
        self.assertEqual(sale.created_by, self.owner)

    def test_repeated_product_is_rejected(self):
        with self.assertRaises(ValidationError):
            self.sell([{"product": self.plug, "quantity": 1}, {"product": self.plug, "quantity": 2}])

        self.assertEqual(stock_of(self.plug), 10)

    def test_cannot_be_deleted(self):
        sale, _ = self.sell([{"product": self.plug, "quantity": 1}])

        with self.assertRaises(SaleIsFinal):
            sale.delete()


class SalePaymentTests(SalesTestCase):
    def test_payment_split_between_methods(self):
        sale, _ = self.sell([{"product": self.brakes, "quantity": 2}], payments=[
            {"amount": 30000, "method": PaymentMethod.CASH},
            {"amount": 20000, "method": PaymentMethod.TRANSFER},
        ])

        self.assertEqual(
            list(sale.payments.values_list("method", "amount")), [("cash", 30000), ("transfer", 20000)],
        )

    def test_partial_payment_is_rejected_and_leaves_nothing(self):
        with self.assertRaises(PaymentMismatch) as raised:
            self.sell([{"product": self.brakes, "quantity": 2}], payments=[
                {"amount": 20000, "method": PaymentMethod.CASH},
            ])

        self.assertEqual((raised.exception.total, raised.exception.paid), (50000, 20000))
        self.assertFalse(Sale.objects.exists())
        self.assertEqual(stock_of(self.brakes), 5)

    def test_overpayment_is_rejected(self):
        with self.assertRaises(PaymentMismatch):
            self.sell([{"product": self.plug, "quantity": 1}], payments=[
                {"amount": 15000, "method": PaymentMethod.CASH},
            ])

        self.assertFalse(Sale.objects.exists())

    def test_without_payment_is_rejected(self):
        with self.assertRaises(PaymentMismatch):
            self.sell([{"product": self.plug, "quantity": 1}], payments=[])

    def test_free_sale_needs_no_payment(self):
        sale, _ = self.sell([{"product": self.plug, "quantity": 1, "unit_price": 0}], user=self.owner, payments=[])

        self.assertEqual(sale.total, 0)

    def test_zero_payment_line_is_rejected_and_leaves_nothing(self):
        with self.assertRaises(ValidationError):
            self.sell([{"product": self.plug, "quantity": 1}], payments=[
                {"amount": 14000, "method": PaymentMethod.CASH},
                {"amount": 0, "method": PaymentMethod.TRANSFER},
            ])

        self.assertFalse(Sale.objects.exists())
        self.assertEqual(stock_of(self.plug), 10)

    def test_database_rejects_zero_quantity(self):
        sale, _ = self.sell([{"product": self.plug, "quantity": 1}])

        with self.assertRaises(IntegrityError), transaction.atomic():
            SaleItem.objects.filter(sale=sale).update(quantity=0)
