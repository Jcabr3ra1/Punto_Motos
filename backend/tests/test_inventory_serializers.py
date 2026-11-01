from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role
from apps.catalog.models import Category, Product
from apps.catalog.serializers import ProductSerializer
from apps.inventory.exceptions import InitialCountFinished
from apps.inventory.models import InitialCount, InventoryBalance, InventoryMovement, MovementKind
from apps.inventory.serializers import (
    AdjustmentSerializer, InitialCountItemSerializer, InitialCountSerializer, InventoryMovementSerializer,
)

from .helpers import make_user
from .test_catalog_models import make_product
from .test_catalog_serializers import context_for

record = InventoryMovement.objects.record


class InventoryDataMixin:
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("vendedor")
        self.product = make_product(cost_price=18000, min_stock=2)


class ProductStockTests(InventoryDataMixin, TestCase):
    def test_product_without_movements_has_zero_stock(self):
        data = ProductSerializer(self.product, context=context_for(self.seller)).data

        self.assertEqual(data["stock"], 0)
        self.assertTrue(data["is_low_stock"])

    def test_stock_comes_from_the_balance(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        product = Product.objects.get(pk=self.product.pk)

        data = ProductSerializer(product, context=context_for(self.seller)).data

        self.assertEqual(data["stock"], 5)
        self.assertFalse(data["is_low_stock"])

    def test_reaching_min_stock_is_low(self):
        record(self.product, MovementKind.INITIAL_COUNT, 2, self.owner)

        self.assertTrue(ProductSerializer(self.product, context=context_for(self.owner)).data["is_low_stock"])


class MovementSerializerTests(InventoryDataMixin, TestCase):
    def test_owner_sees_unit_cost_and_seller_does_not(self):
        movement = record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)

        owner_data = InventoryMovementSerializer(movement, context=context_for(self.owner)).data
        seller_data = InventoryMovementSerializer(movement, context=context_for(self.seller)).data

        self.assertEqual(owner_data["unit_cost"], 18000)
        self.assertNotIn("unit_cost", seller_data)
        self.assertEqual(seller_data["product"]["code"], "FRE-PUL-PAS")
        self.assertEqual(seller_data["kind_label"], "Inventario inicial")
        self.assertEqual(seller_data["created_by"], "dueno")
        self.assertEqual(seller_data["balance_after"], 5)


class AdjustmentSerializerTests(InventoryDataMixin, TestCase):
    def adjust(self, **data):
        payload = {"product": self.product.pk, "quantity": -1, "reason": "Se dañó"}
        payload.update(data)
        return AdjustmentSerializer(data=payload, context=context_for(self.owner))

    def test_adjustment_moves_stock_and_returns_the_movement(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        serializer = self.adjust(reason="  Se dañó   en bodega ")
        self.assertTrue(serializer.is_valid(), serializer.errors)

        serializer.save()

        self.assertEqual(serializer.data["quantity"], -1)
        self.assertEqual(serializer.data["reason"], "Se dañó en bodega")
        self.assertEqual(serializer.data["balance_after"], 4)

    def test_rejects_zero_and_missing_reason(self):
        serializer = self.adjust(quantity=0, reason="   ")

        self.assertFalse(serializer.is_valid())
        self.assertEqual(set(serializer.errors), {"quantity", "reason"})

    def test_cannot_subtract_more_than_available(self):
        record(self.product, MovementKind.INITIAL_COUNT, 2, self.owner)
        serializer = self.adjust(quantity=-3)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with self.assertRaisesMessage(ValidationError, "Solo hay 2 unidades"):
            serializer.save()
        self.assertEqual(InventoryBalance.objects.get(product=self.product).quantity, 2)


class InitialCountItemTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.brakes = Category.objects.create(name="Frenos", abbreviation="FRE")

    def item(self, **data):
        payload = {
            "name": "Pastillas de freno traseras", "category": self.brakes.pk,
            "cost_price": 18000, "sale_price": 25000, "quantity": 4,
        }
        payload.update(data)
        return InitialCountItemSerializer(data=payload, context=context_for(self.owner))

    def test_creates_product_and_initial_movement_together(self):
        serializer = self.item()
        self.assertTrue(serializer.is_valid(), serializer.errors)

        product = serializer.save()

        movement = InventoryMovement.objects.get(product=product)
        self.assertEqual((movement.kind, movement.quantity, movement.unit_cost), ("initial_count", 4, 18000))
        self.assertEqual(serializer.data["stock"], 4)
        self.assertEqual(serializer.data["code"], "FRE-UNI-PAS")

    def test_zero_units_creates_product_without_movement(self):
        serializer = self.item(quantity=0)
        self.assertTrue(serializer.is_valid(), serializer.errors)

        product = serializer.save()

        self.assertFalse(InventoryMovement.objects.filter(product=product).exists())

    def test_rejects_negative_quantity(self):
        serializer = self.item(quantity=-1)

        self.assertFalse(serializer.is_valid())
        self.assertIn("quantity", serializer.errors)

    def test_rejected_once_the_count_is_finished(self):
        InitialCount.objects.create(pk=1, finished_at=timezone.now(), finished_by=self.owner)
        serializer = self.item()

        with self.assertRaises(InitialCountFinished):
            serializer.is_valid()


class InitialCountStatusTests(InventoryDataMixin, TestCase):
    def test_reports_progress(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        record(make_product(code="ELE-UNI-BUJ", name="Bujía"), MovementKind.INITIAL_COUNT, 3, self.owner)

        data = InitialCountSerializer(InitialCount.load()).data

        self.assertEqual(data["is_open"], True)
        self.assertIsNone(data["finished_by"])
        self.assertEqual((data["products_counted"], data["units_counted"]), (2, 8))
