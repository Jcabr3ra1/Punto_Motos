import uuid

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role
from apps.inventory.exceptions import InitialCountInProgress
from apps.inventory.models import InitialCount, InventoryMovement, MovementKind
from apps.sales.models import Customer, Sale
from apps.sales.serializers import CustomerSerializer, SaleWriteSerializer

from .helpers import make_user, open_cash
from .test_catalog_models import make_product
from .test_catalog_serializers import context_for
from .test_sales_models import finish_initial_count, stock_of


class SaleSerializerTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.seller = make_user("vendedor")
        self.brakes = make_product(cost_price=18000, sale_price=25000)
        self.plug = make_product(code="ELE-UNI-BUJ", name="Bujía NGK", cost_price=9000, sale_price=14000)
        InventoryMovement.objects.record(self.brakes, MovementKind.INITIAL_COUNT, 5, self.owner)
        InventoryMovement.objects.record(self.plug, MovementKind.INITIAL_COUNT, 2, self.owner)
        finish_initial_count(self.owner)
        self.customer = Customer.objects.create(name="Juan Pérez")

    def data(self, **extra):
        data = {
            "idempotency_key": str(uuid.uuid4()),
            "customer": self.customer.pk,
            "items": [{"product": self.brakes.pk, "quantity": 2}],
            "payments": [{"method": "cash", "amount": 50000}],
        }
        data.update(extra)
        return data

    def serializer(self, data, user=None):
        return SaleWriteSerializer(data=data, context=context_for(user or self.seller))

    def errors(self, data, user=None):
        serializer = self.serializer(data, user)
        if serializer.is_valid():
            with self.assertRaises(ValidationError) as raised:
                serializer.save()
            return raised.exception.detail
        return serializer.errors

    def confirm(self, data, user=None):
        serializer = self.serializer(data, user)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer


class CustomerSerializerTests(TestCase):
    def test_name_can_repeat_and_is_cleaned(self):
        Customer.objects.create(name="Juan Pérez")
        serializer = CustomerSerializer(data={"name": "  Juan   Pérez "})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.save().name, "Juan Pérez")

    def test_blank_name_is_rejected(self):
        serializer = CustomerSerializer(data={"name": "   "})

        self.assertFalse(serializer.is_valid())
        self.assertIn("name", serializer.errors)


class SaleWriteSerializerTests(SaleSerializerTestCase):
    def test_confirms_and_returns_receipt_data(self):
        serializer = self.confirm(self.data(payments=[
            {"method": "cash", "amount": 30000}, {"method": "transfer", "amount": 20000},
        ]))

        self.assertTrue(serializer.created)
        data = serializer.data
        self.assertEqual((data["number"], data["total"]), (1, 50000))
        self.assertEqual(data["customer"]["name"], "Juan Pérez")
        self.assertEqual(data["items"][0]["description"], "FRE-PUL-PAS · Pastillas de freno Pulsar 180")
        self.assertEqual([p["method_label"] for p in data["payments"]], ["Efectivo", "Transferencia"])
        self.assertNotIn("unit_cost", data["items"][0])
        self.assertEqual(stock_of(self.brakes), 3)

    def test_owner_sees_unit_cost(self):
        data = self.confirm(self.data(), user=self.owner).data

        self.assertEqual(data["items"][0]["unit_cost"], 18000)

    def test_new_customer_is_created_with_the_sale(self):
        data = self.confirm(self.data(customer=None, new_customer={"name": " Ana  Gómez ", "phone": "300 1"})).data

        self.assertEqual(data["customer"]["name"], "Ana Gómez")
        self.assertTrue(Customer.objects.filter(name="Ana Gómez", phone="300 1").exists())

    def test_needs_exactly_one_customer(self):
        self.assertIn("customer", self.errors(self.data(customer=None)))
        self.assertIn("customer", self.errors(self.data(new_customer={"name": "Ana"})))

    def test_retry_returns_the_same_sale_without_new_customer(self):
        data = self.data(customer=None, new_customer={"name": "Ana Gómez"})
        first = self.confirm(data)
        again = self.confirm(data)

        self.assertFalse(again.created)
        self.assertEqual(again.data["id"], first.data["id"])
        self.assertEqual(Customer.objects.filter(name="Ana Gómez").count(), 1)
        self.assertEqual(stock_of(self.brakes), 3)

    def test_payment_must_match_total(self):
        errors = self.errors(self.data(payments=[{"method": "cash", "amount": 40000}]))

        self.assertEqual(errors["payments"], ["La venta es de $50.000 y el pago suma $40.000: deben ser iguales."])

    def test_repeated_method_is_rejected(self):
        errors = self.errors(self.data(payments=[
            {"method": "cash", "amount": 25000}, {"method": "cash", "amount": 25000},
        ]))

        self.assertIn("payments", errors)

    def test_seller_cannot_change_price(self):
        errors = self.errors(self.data(
            items=[{"product": self.plug.pk, "quantity": 1}, {"product": self.brakes.pk, "quantity": 1, "unit_price": 1}],
            payments=[{"method": "cash", "amount": 14001}],
        ))

        self.assertEqual(errors["items"][1]["unit_price"], ["Solo el dueño puede cambiar el precio."])

    def test_owner_changes_price(self):
        data = self.confirm(self.data(
            items=[{"product": self.brakes.pk, "quantity": 2, "unit_price": 22000}],
            payments=[{"method": "cash", "amount": 44000}],
        ), user=self.owner).data

        self.assertTrue(data["items"][0]["price_changed"])
        self.assertEqual(data["total"], 44000)

    def test_not_enough_stock_points_to_the_line(self):
        errors = self.errors(self.data(
            items=[{"product": self.brakes.pk, "quantity": 1}, {"product": self.plug.pk, "quantity": 3}],
            payments=[{"method": "cash", "amount": 25000 + 3 * 14000}],
        ))

        self.assertEqual(errors["items"][1]["quantity"], ["Solo hay 2 unidades de ELE-UNI-BUJ."])
        self.assertEqual(errors["items"][0], {})

    def test_failed_sale_does_not_create_new_customer(self):
        self.errors(self.data(
            customer=None, new_customer={"name": "Ana Gómez"},
            items=[{"product": self.plug.pk, "quantity": 3}], payments=[{"method": "cash", "amount": 42000}],
        ))

        self.assertFalse(Customer.objects.filter(name="Ana Gómez").exists())

    def test_empty_or_repeated_items_are_rejected(self):
        self.assertEqual(self.errors(self.data(items=[], payments=[]))["items"], ["Agrega al menos un producto."])
        errors = self.errors(self.data(
            items=[{"product": self.brakes.pk, "quantity": 1}, {"product": self.brakes.pk, "quantity": 1}],
        ))
        self.assertIn("repetido", errors["items"][1]["product"][0])

    def test_inactive_product_is_rejected(self):
        self.brakes.is_active = False
        self.brakes.save()

        self.assertIn("items", self.errors(self.data()))

    def test_initial_count_open_is_a_conflict(self):
        InitialCount.objects.filter(pk=InitialCount.SINGLETON_PK).update(finished_at=None, finished_by=None)
        serializer = self.serializer(self.data())
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(InitialCountInProgress):
            serializer.save()
        self.assertFalse(Sale.objects.exists())
