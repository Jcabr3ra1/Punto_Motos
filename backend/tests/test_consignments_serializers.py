import uuid

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role
from apps.consignments.models import Consignee, ConsignmentDelivery, ConsignmentReport
from apps.consignments.serializers import (
    ConsigneePaymentWriteSerializer, ConsigneeSerializer, ConsignmentDeliveryWriteSerializer,
    ConsignmentReportWriteSerializer,
)
from apps.inventory.models import InventoryMovement, MovementKind

from .helpers import make_user, open_cash
from .test_catalog_models import make_product
from .test_catalog_serializers import context_for
from .test_sales_models import finish_initial_count, stock_of


class ConsignmentSerializerTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.brakes = make_product(cost_price=18000, sale_price=25000)
        self.plug = make_product(code="ELE-UNI-BUJ", name="Bujía NGK", cost_price=9000, sale_price=14000)
        InventoryMovement.objects.record(self.brakes, MovementKind.INITIAL_COUNT, 5, self.owner)
        InventoryMovement.objects.record(self.plug, MovementKind.INITIAL_COUNT, 2, self.owner)
        finish_initial_count(self.owner)
        self.shop = Consignee.objects.create(name="Motos El Paisa")

    def run_serializer(self, serializer_class, data):
        serializer = serializer_class(data=data, context=context_for(self.owner))
        if not serializer.is_valid():
            return serializer, serializer.errors
        try:
            serializer.save()
        except ValidationError as error:
            return serializer, error.detail
        return serializer, None

    def deliver(self, items, **extra):
        data = {"idempotency_key": str(uuid.uuid4()), "consignee": self.shop.pk, "items": items, **extra}
        return self.run_serializer(ConsignmentDeliveryWriteSerializer, data)


class ConsigneeSerializerTests(ConsignmentSerializerTestCase):
    def test_duplicate_name_is_rejected(self):
        serializer = ConsigneeSerializer(data={"name": "motos el paisa"})

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["name"], ["Ya existe un local con ese nombre."])

    def test_balance_is_read_only(self):
        serializer = ConsigneeSerializer(self.shop, data={"name": "Motos El Paisa", "balance_due": 999}, partial=True)
        serializer.is_valid(raise_exception=True)

        self.assertEqual(serializer.save().balance_due, 0)


class DeliveryWriteSerializerTests(ConsignmentSerializerTestCase):
    def test_delivers_with_cost_as_default_value(self):
        serializer, errors = self.deliver([
            {"product": self.brakes.pk, "quantity": 2, "unit_value": 19000}, {"product": self.plug.pk, "quantity": 1},
        ])

        self.assertIsNone(errors)
        self.assertTrue(serializer.created)
        data = serializer.data
        self.assertEqual([item["unit_value"] for item in data["items"]], [19000, 9000])
        self.assertEqual(data["total_value"], 2 * 19000 + 9000)
        self.assertEqual(stock_of(self.brakes), 3)

    def test_not_enough_stock_points_to_the_line(self):
        _, errors = self.deliver([{"product": self.brakes.pk, "quantity": 1}, {"product": self.plug.pk, "quantity": 3}])

        self.assertEqual(errors["items"][1]["quantity"], ["Solo hay 2 unidades de ELE-UNI-BUJ."])
        self.assertFalse(ConsignmentDelivery.objects.exists())

    def test_empty_items_are_rejected(self):
        _, errors = self.deliver([])

        self.assertEqual(errors["items"], ["Agrega al menos un producto."])


class ReportWriteSerializerTests(ConsignmentSerializerTestCase):
    def setUp(self):
        super().setUp()
        serializer, _ = self.deliver([{"product": self.brakes.pk, "quantity": 3, "unit_value": 19000}])
        self.item_id = serializer.data["items"][0]["id"]

    def report(self, lines, consignee=None):
        return self.run_serializer(ConsignmentReportWriteSerializer, {
            "consignee": (consignee or self.shop).pk, "lines": lines,
        })

    def test_records_sold_and_returned(self):
        serializer, errors = self.report([{"item": self.item_id, "sold": 2, "returned": 1}])

        self.assertIsNone(errors)
        data = serializer.data
        self.assertEqual(data["total"], 38000)
        self.assertEqual(data["lines"][0]["subtotal"], 38000)
        self.assertEqual(data["lines"][0]["product"]["code"], "FRE-PUL-PAS")
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.balance_due, 38000)
        self.assertEqual(stock_of(self.brakes), 3)

    def test_more_than_pending_points_to_the_line(self):
        _, errors = self.report([{"item": self.item_id, "sold": 4}])

        self.assertEqual(errors["lines"][0]["sold"], ["Al local le quedan 3 de FRE-PUL-PAS."])
        self.assertFalse(ConsignmentReport.objects.exists())

    def test_line_of_another_shop_is_rejected(self):
        other = Consignee.objects.create(name="Repuestos La 80")

        _, errors = self.report([{"item": self.item_id, "sold": 1}], consignee=other)

        self.assertEqual(errors["lines"][0]["item"], ["Esta línea es de una entrega a otro local."])

    def test_all_zero_is_rejected(self):
        _, errors = self.report([{"item": self.item_id}])

        self.assertEqual(errors["lines"], ["Indica al menos una unidad vendida o devuelta."])


class ConsigneePaymentWriteSerializerTests(ConsignmentSerializerTestCase):
    def pay(self, amount):
        return self.run_serializer(ConsigneePaymentWriteSerializer, {
            "consignee": self.shop.pk, "amount": amount, "method": "cash",
        })

    def test_without_balance_is_rejected(self):
        _, errors = self.pay(1000)

        self.assertEqual(errors["amount"], ["El local no debe nada: no se puede registrar el pago."])

    def test_pays_and_lowers_balance(self):
        Consignee.objects.filter(pk=self.shop.pk).update(balance_due=30000)

        serializer, errors = self.pay(10000)

        self.assertIsNone(errors)
        self.assertEqual(serializer.data["method_label"], "Efectivo")
        self.shop.refresh_from_db()
        self.assertEqual(self.shop.balance_due, 20000)

    def test_more_than_owed_is_rejected(self):
        Consignee.objects.filter(pk=self.shop.pk).update(balance_due=30000)

        _, errors = self.pay(30001)

        self.assertEqual(errors["amount"], ["El local debe $30.000: no se pueden pagar $30.001."])
