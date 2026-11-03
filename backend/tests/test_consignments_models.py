import uuid

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import Role
from apps.consignments.models import (
    Consignee, ConsigneePayment, ConsignmentDelivery, ConsignmentIsFinal, ConsignmentItem, ConsignmentReport,
    EmptyDelivery, EmptyReport, ExceedsConsigned, Overpayment,
)
from apps.core.models import PaymentMethod
from apps.inventory.models import (
    InitialCount, InitialCountOpen, InsufficientStock, InventoryMovement, MovementKind,
)

from .helpers import make_user, open_cash
from .test_catalog_models import make_product
from .test_sales_models import finish_initial_count, stock_of

deliver = ConsignmentDelivery.objects.deliver
report = ConsignmentReport.objects.record
pay = ConsigneePayment.objects.record


class ConsignmentTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.brakes = make_product(cost_price=18000, sale_price=25000)
        self.plug = make_product(code="ELE-UNI-BUJ", name="Bujía NGK", cost_price=9000, sale_price=14000)
        InventoryMovement.objects.record(self.brakes, MovementKind.INITIAL_COUNT, 5, self.owner)
        InventoryMovement.objects.record(self.plug, MovementKind.INITIAL_COUNT, 10, self.owner)
        finish_initial_count(self.owner)
        self.shop = Consignee.objects.create(name="Motos El Paisa")

    def deliver(self, items, key=None, consignee=None):
        return deliver(consignee or self.shop, items, self.owner, key or uuid.uuid4())


class ConsigneeTests(TestCase):
    def test_name_is_unique_without_case(self):
        Consignee.objects.create(name="Motos El Paisa")
        with self.assertRaises(IntegrityError):
            Consignee.objects.create(name="motos  el paisa")

    def test_editing_a_stale_copy_keeps_the_balance(self):
        shop = Consignee.objects.create(name="Motos El Paisa")
        stale = Consignee.objects.get(pk=shop.pk)
        Consignee.objects.filter(pk=shop.pk).update(balance_due=40000)

        stale.phone = "3001234567"
        stale.save()

        shop.refresh_from_db()
        self.assertEqual((shop.phone, shop.balance_due), ("3001234567", 40000))


class DeliverTests(ConsignmentTestCase):
    def test_units_leave_stock_at_cost_by_default(self):
        delivery, created = self.deliver([{"product": self.brakes, "quantity": 3}])

        self.assertTrue(created)
        item = delivery.items.get()
        self.assertEqual((item.unit_value, item.unit_cost, item.pending_quantity), (18000, 18000, 3))
        self.assertEqual(stock_of(self.brakes), 2)
        movement = self.brakes.movements.get(kind=MovementKind.CONSIGNMENT_OUT)
        self.assertEqual((movement.quantity, movement.unit_cost), (-3, 18000))
        self.assertEqual(movement.reason, f"Consignación {delivery.pk} · Motos El Paisa")

    def test_agreed_value_can_differ_from_cost(self):
        delivery, _ = self.deliver([{"product": self.brakes, "quantity": 1, "unit_value": 19500}])

        self.assertEqual(delivery.items.get().unit_value, 19500)

    def test_same_key_returns_the_same_delivery(self):
        key = uuid.uuid4()
        delivery, _ = self.deliver([{"product": self.brakes, "quantity": 3}], key=key)
        again, created = self.deliver([{"product": self.brakes, "quantity": 3}], key=key)

        self.assertFalse(created)
        self.assertEqual(again.pk, delivery.pk)
        self.assertEqual(stock_of(self.brakes), 2)

    def test_not_enough_stock_leaves_nothing(self):
        with self.assertRaises(InsufficientStock):
            self.deliver([{"product": self.plug, "quantity": 2}, {"product": self.brakes, "quantity": 6}])

        self.assertFalse(ConsignmentDelivery.objects.exists())
        self.assertEqual(stock_of(self.plug), 10)

    def test_empty_or_repeated_is_rejected(self):
        with self.assertRaises(EmptyDelivery):
            self.deliver([])
        with self.assertRaises(ValidationError):
            self.deliver([{"product": self.plug, "quantity": 1}, {"product": self.plug, "quantity": 1}])

    def test_not_while_initial_count_is_open(self):
        InitialCount.objects.filter(pk=InitialCount.SINGLETON_PK).update(finished_at=None, finished_by=None)

        with self.assertRaises(InitialCountOpen):
            self.deliver([{"product": self.plug, "quantity": 1}])

    def test_cannot_be_deleted(self):
        delivery, _ = self.deliver([{"product": self.plug, "quantity": 1}])

        with self.assertRaises(ConsignmentIsFinal):
            delivery.delete()


class ReportTests(ConsignmentTestCase):
    def setUp(self):
        super().setUp()
        delivery, _ = self.deliver([
            {"product": self.brakes, "quantity": 4, "unit_value": 19000},
            {"product": self.plug, "quantity": 5},
        ])
        self.brakes_item = delivery.items.get(product=self.brakes)
        self.plug_item = delivery.items.get(product=self.plug)

    def test_sold_adds_to_balance_and_returned_goes_back_to_stock(self):
        result = report(self.shop, [
            {"item": self.brakes_item, "sold": 2, "returned": 1},
            {"item": self.plug_item, "sold": 1},
        ], self.owner)

        self.assertEqual(result.total, 2 * 19000 + 9000)
        self.assertEqual(self.shop.balance_due, 47000)
        self.brakes_item.refresh_from_db()
        self.assertEqual(
            (self.brakes_item.sold_quantity, self.brakes_item.returned_quantity, self.brakes_item.pending_quantity),
            (2, 1, 1),
        )
        self.assertEqual(stock_of(self.brakes), 1 + 1)
        movement = self.brakes.movements.get(kind=MovementKind.CONSIGNMENT_RETURN)
        self.assertEqual((movement.quantity, movement.unit_cost), (1, 18000))

    def test_cannot_report_more_than_pending_and_leaves_nothing(self):
        report(self.shop, [{"item": self.brakes_item, "sold": 3}], self.owner)

        with self.assertRaises(ExceedsConsigned) as raised:
            report(self.shop, [
                {"item": self.plug_item, "returned": 2},
                {"item": self.brakes_item, "sold": 1, "returned": 1},
            ], self.owner)

        self.assertEqual((raised.exception.pending, raised.exception.requested), (1, 2))
        self.assertEqual(ConsignmentReport.objects.count(), 1)
        self.plug_item.refresh_from_db()
        self.assertEqual(self.plug_item.returned_quantity, 0)
        self.assertEqual(stock_of(self.plug), 5)
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.balance_due, 57000)

    def test_empty_report_is_rejected(self):
        with self.assertRaises(EmptyReport):
            report(self.shop, [{"item": self.brakes_item, "sold": 0, "returned": 0}], self.owner)

    def test_item_of_another_shop_is_rejected(self):
        other = Consignee.objects.create(name="Repuestos La 80")

        with self.assertRaises(ValueError):
            report(other, [{"item": self.brakes_item, "sold": 1}], self.owner)

        self.assertFalse(ConsignmentReport.objects.exists())

    def test_database_rejects_more_than_delivered(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ConsignmentItem.objects.filter(pk=self.brakes_item.pk).update(sold_quantity=3, returned_quantity=2)


class ConsigneePaymentTests(ConsignmentTestCase):
    def setUp(self):
        super().setUp()
        delivery, _ = self.deliver([{"product": self.brakes, "quantity": 3}])
        report(self.shop, [{"item": delivery.items.get(), "sold": 2}], self.owner)  # debe 36.000

    def test_pays_in_parts(self):
        pay(self.shop, 20000, PaymentMethod.CASH, self.owner)
        pay(self.shop, 16000, PaymentMethod.TRANSFER, self.owner)

        self.assertEqual(self.shop.balance_due, 0)
        self.assertEqual(ConsigneePayment.objects.count(), 2)

    def test_more_than_owed_is_rejected(self):
        with self.assertRaises(Overpayment) as raised:
            pay(self.shop, 36001, PaymentMethod.CASH, self.owner)

        self.assertEqual(raised.exception.balance_due, 36000)
        self.assertFalse(ConsigneePayment.objects.exists())

    def test_zero_is_rejected(self):
        with self.assertRaises(ValidationError):
            pay(self.shop, 0, PaymentMethod.CASH, self.owner)
