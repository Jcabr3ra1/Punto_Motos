from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.accounts.models import Role
from apps.inventory.models import (
    InitialCount, InsufficientStock, InventoryBalance, InventoryMovement, MovementKind,
)

from .helpers import make_user
from .test_catalog_models import make_product

record = InventoryMovement.objects.record


class RecordMovementTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.product = make_product(cost_price=18000)

    def test_entry_creates_balance_and_movement(self):
        movement = record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)

        self.assertEqual(InventoryBalance.objects.get(product=self.product).quantity, 5)
        self.assertEqual(movement.balance_after, 5)
        self.assertEqual(movement.unit_cost, 18000)  # toma el costo del producto si no se indica
        self.assertEqual(movement.created_by, self.owner)

    def test_balance_after_follows_each_movement(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        record(self.product, MovementKind.PURCHASE, 3, self.owner, unit_cost=17000)
        sale = record(self.product, MovementKind.SALE, -2, self.owner)

        self.assertEqual(sale.balance_after, 6)
        self.assertEqual(self.product.balance.quantity, 6)

    def test_sale_without_enough_stock_leaves_no_trace(self):
        record(self.product, MovementKind.INITIAL_COUNT, 2, self.owner)

        with self.assertRaises(InsufficientStock) as ctx:
            record(self.product, MovementKind.SALE, -3, self.owner)

        self.assertEqual((ctx.exception.available, ctx.exception.requested), (2, 3))
        self.assertEqual(InventoryBalance.objects.get(product=self.product).quantity, 2)
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_sale_of_product_never_counted_is_rejected(self):
        with self.assertRaises(InsufficientStock):
            record(self.product, MovementKind.SALE, -1, self.owner)

    def test_adjustment_can_go_both_ways_with_reason(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        record(self.product, MovementKind.ADJUSTMENT, -1, self.owner, reason="  Se dañó  en bodega ")
        movement = record(self.product, MovementKind.ADJUSTMENT, 2, self.owner, reason="Sobrante del conteo")

        self.assertEqual(movement.balance_after, 6)
        self.assertEqual(InventoryMovement.objects.filter(reason="Se dañó en bodega").count(), 1)

    def test_invalid_movements_are_rejected_before_touching_balance(self):
        cases = [
            ("cantidad cero", MovementKind.PURCHASE, 0, ""),
            ("compra negativa", MovementKind.PURCHASE, -1, ""),
            ("venta positiva", MovementKind.SALE, 1, ""),
            ("ajuste sin motivo", MovementKind.ADJUSTMENT, 1, "   "),
        ]
        for label, kind, quantity, reason in cases:
            with self.subTest(label):
                with self.assertRaises(ValidationError):
                    record(self.product, kind, quantity, self.owner, reason=reason)
        self.assertFalse(InventoryMovement.objects.exists())
        self.assertFalse(InventoryBalance.objects.exists())

    def test_only_one_initial_count_per_product(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)

        with self.assertRaises(ValidationError):
            record(self.product, MovementKind.INITIAL_COUNT, 1, self.owner)
        self.assertEqual(self.product.balance.quantity, 5)

    def test_database_blocks_negative_balance(self):
        balance = InventoryBalance.objects.create(product=self.product)

        balance.quantity = -1
        with self.assertRaises(IntegrityError), transaction.atomic():
            balance.save()


class InitialCountTests(TestCase):
    def test_starts_open_and_is_a_single_record(self):
        count = InitialCount.load()

        self.assertTrue(count.is_open)
        self.assertEqual(InitialCount.load().pk, count.pk)
        with self.assertRaises(IntegrityError), transaction.atomic():
            InitialCount.objects.create(pk=2)
