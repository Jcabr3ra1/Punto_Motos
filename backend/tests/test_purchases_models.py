from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Role
from apps.catalog.models import PriceChange
from apps.inventory.models import InventoryBalance, InventoryMovement, MovementKind
from apps.purchases.models import (
    EmptyPurchase, Overpayment, PaymentMethod, PaymentStatus, Purchase, PurchaseItem, PurchaseNotDraft,
    PurchaseNotReceived, PurchaseStatus, Supplier, SupplierPayment, raised_sale_price, weighted_average_cost,
)

from .helpers import make_user
from .test_catalog_models import make_product

pay = SupplierPayment.objects.record


def make_purchase(user, supplier=None, items=(), **extra):
    supplier = supplier or Supplier.objects.get_or_create(name="Distribuidora Andina")[0]
    purchase = Purchase.objects.create(supplier=supplier, created_by=user, **extra)
    for product, quantity, unit_cost in items:
        PurchaseItem.objects.create(purchase=purchase, product=product, quantity=quantity, unit_cost=unit_cost)
    return purchase


class WeightedAverageCostTests(TestCase):
    def test_mixes_current_stock_with_new_units(self):
        self.assertEqual(weighted_average_cost(5, 18000, 3, 20000), 18750)

    def test_without_stock_takes_purchase_cost(self):
        self.assertEqual(weighted_average_cost(0, 18000, 4, 21000), 21000)

    def test_rounds_to_nearest_peso(self):
        # (1 × 1000 + 2 × 1001) / 3 = 1000,67 -> 1001
        self.assertEqual(weighted_average_cost(1, 1000, 2, 1001), 1001)
        # (1 × 1000 + 1 × 1001) / 2 = 1000,5 -> 1001 (la mitad sube)
        self.assertEqual(weighted_average_cost(1, 1000, 1, 1001), 1001)


class SupplierTests(TestCase):
    def test_name_is_unique_without_case(self):
        Supplier.objects.create(name="Distribuidora Andina")
        with self.assertRaises(IntegrityError):
            Supplier.objects.create(name="distribuidora  andina")


class ReceivePurchaseTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.brakes = make_product(cost_price=18000)
        self.plug = make_product(code="ELE-UNI-BUJ", name="Bujía NGK", cost_price=9000)

    def test_draft_does_not_touch_inventory(self):
        purchase = make_purchase(self.owner, items=[(self.brakes, 3, 20000)])

        self.assertEqual(purchase.status, PurchaseStatus.DRAFT)
        self.assertEqual(purchase.items_total, 60000)
        self.assertEqual(purchase.total, 0)
        self.assertFalse(InventoryMovement.objects.exists())

    def test_receive_adds_stock_fixes_total_and_averages_cost(self):
        InventoryMovement.objects.record(self.brakes, MovementKind.INITIAL_COUNT, 5, self.owner)
        purchase = make_purchase(self.owner, items=[(self.brakes, 3, 20000), (self.plug, 10, 9500)])

        purchase.receive(self.owner)

        self.assertEqual(purchase.status, PurchaseStatus.RECEIVED)
        self.assertEqual(purchase.total, 155000)
        self.assertEqual(purchase.received_by, self.owner)
        self.assertIsNotNone(purchase.received_at)
        self.assertEqual(InventoryBalance.objects.get(product=self.brakes).quantity, 8)
        self.assertEqual(InventoryBalance.objects.get(product=self.plug).quantity, 10)
        self.brakes.refresh_from_db()
        self.plug.refresh_from_db()
        self.assertEqual(self.brakes.cost_price, 18750)
        self.assertEqual(self.plug.cost_price, 9500)  # no tenía existencias

        movement = InventoryMovement.objects.get(product=self.brakes, kind=MovementKind.PURCHASE)
        self.assertEqual((movement.quantity, movement.unit_cost), (3, 20000))  # conserva el costo de la compra
        self.assertEqual(movement.reason, f"Compra {purchase.pk} · Distribuidora Andina")

    def test_second_receive_changes_nothing(self):
        purchase = make_purchase(self.owner, items=[(self.brakes, 3, 20000)])
        purchase.receive(self.owner)

        with self.assertRaises(PurchaseNotDraft):
            purchase.receive(self.owner)

        self.assertEqual(InventoryBalance.objects.get(product=self.brakes).quantity, 3)
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_stale_copy_cannot_receive_twice(self):
        purchase = make_purchase(self.owner, items=[(self.brakes, 3, 20000)])
        stale = Purchase.objects.get(pk=purchase.pk)  # como una segunda petición por doble clic
        purchase.receive(self.owner)

        with self.assertRaises(PurchaseNotDraft):
            stale.receive(self.owner)
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_empty_purchase_cannot_be_received(self):
        purchase = make_purchase(self.owner)

        with self.assertRaises(EmptyPurchase):
            purchase.receive(self.owner)
        purchase.refresh_from_db()
        self.assertEqual(purchase.status, PurchaseStatus.DRAFT)

    def test_received_purchase_cannot_be_deleted(self):
        draft = make_purchase(self.owner, items=[(self.brakes, 1, 20000)])
        received = make_purchase(self.owner, items=[(self.brakes, 1, 20000)])
        received.receive(self.owner)

        draft.delete()
        with self.assertRaises(PurchaseNotDraft):
            received.delete()
        self.assertEqual(list(Purchase.objects.values_list("pk", flat=True)), [received.pk])

    def test_same_product_twice_is_rejected(self):
        purchase = make_purchase(self.owner, items=[(self.brakes, 1, 20000)])

        with self.assertRaises(IntegrityError):
            PurchaseItem.objects.create(purchase=purchase, product=self.brakes, quantity=2, unit_cost=20000)

    def test_zero_quantity_is_rejected(self):
        purchase = make_purchase(self.owner)

        with self.assertRaises(ValidationError):
            PurchaseItem(purchase=purchase, product=self.brakes, quantity=0, unit_cost=20000).full_clean()

    def test_supplier_document_cannot_repeat(self):
        supplier = Supplier.objects.create(name="Motorepuestos Sur")
        make_purchase(self.owner, supplier=supplier, document_number="FV-1020")
        make_purchase(self.owner, supplier=supplier)  # sin documento se puede repetir
        make_purchase(self.owner, supplier=supplier)
        make_purchase(self.owner, document_number="FV-1020")  # otro proveedor

        with self.assertRaises(IntegrityError):
            make_purchase(self.owner, supplier=supplier, document_number="fv-1020")


class SupplierPaymentTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.supplier = Supplier.objects.create(name="Distribuidora Andina")
        self.product = make_product()

    def received(self, units, unit_cost=10000):
        purchase = make_purchase(self.owner, supplier=self.supplier, items=[(self.product, units, unit_cost)])
        purchase.receive(self.owner)
        return purchase

    def test_payment_status_follows_abonos(self):
        purchase = self.received(10)  # 100.000
        self.assertEqual((purchase.payment_status, purchase.balance_due), (PaymentStatus.PENDING, 100000))

        pay(self.supplier, 40000, PaymentMethod.CASH, self.owner, purchase=purchase)
        self.assertEqual((purchase.payment_status, purchase.balance_due), (PaymentStatus.PARTIAL, 60000))

        pay(self.supplier, 60000, PaymentMethod.TRANSFER, self.owner, purchase=purchase, notes="  Nequi ")
        self.assertEqual((purchase.payment_status, purchase.balance_due), (PaymentStatus.PAID, 0))
        self.assertEqual(SupplierPayment.objects.filter(notes="Nequi").count(), 1)

    def test_draft_has_no_payment_status_and_cannot_be_paid(self):
        draft = make_purchase(self.owner, supplier=self.supplier, items=[(self.product, 1, 10000)])

        self.assertIsNone(draft.payment_status)
        with self.assertRaises(PurchaseNotReceived):
            pay(self.supplier, 10000, PaymentMethod.CASH, self.owner, purchase=draft)
        self.assertFalse(SupplierPayment.objects.exists())

    def test_abono_without_purchase_pays_oldest_first(self):
        first = self.received(3)   # 30.000
        second = self.received(5)  # 50.000
        third = self.received(2)   # 20.000
        self.assertEqual(self.supplier.balance_due, 100000)

        payment = pay(self.supplier, 45000, PaymentMethod.CASH, self.owner)

        for purchase in (first, second, third):
            purchase.refresh_from_db()
        self.assertEqual([p.paid_amount for p in (first, second, third)], [30000, 15000, 0])
        self.assertEqual(
            list(payment.allocations.values_list("purchase", "amount")), [(first.pk, 30000), (second.pk, 15000)],
        )
        self.assertEqual(self.supplier.balance_due, 55000)

    def test_balance_ignores_drafts_and_other_suppliers(self):
        self.received(3)
        make_purchase(self.owner, supplier=self.supplier, items=[(self.product, 9, 10000)])
        other = Supplier.objects.create(name="Motorepuestos Sur")
        make_purchase(self.owner, supplier=other, items=[(self.product, 1, 5000)]).receive(self.owner)

        self.assertEqual(self.supplier.balance_due, 30000)
        self.assertEqual(other.balance_due, 5000)
        self.assertEqual(Supplier.objects.create(name="Sin compras").balance_due, 0)

    def test_overpayment_leaves_no_trace(self):
        purchase = self.received(10)
        self.received(2)
        pay(self.supplier, 70000, PaymentMethod.CASH, self.owner, purchase=purchase)

        cases = [
            ({"purchase": purchase}, 30001, 30000),  # más que el saldo de esa compra
            ({}, 50001, 50000),                      # más que todo lo que se le debe
        ]
        for extra, amount, due in cases:
            with self.subTest(extra=extra), self.assertRaises(Overpayment) as ctx:
                pay(self.supplier, amount, PaymentMethod.CASH, self.owner, **extra)
            self.assertEqual((ctx.exception.balance_due, ctx.exception.requested), (due, amount))

        self.assertEqual(SupplierPayment.objects.count(), 1)
        self.assertEqual(self.supplier.balance_due, 50000)

    def test_stale_copy_cannot_overpay(self):
        purchase = self.received(10)
        stale = Purchase.objects.get(pk=purchase.pk)
        pay(self.supplier, 100000, PaymentMethod.CASH, self.owner, purchase=purchase)

        with self.assertRaises(Overpayment):
            pay(self.supplier, 100000, PaymentMethod.CASH, self.owner, purchase=stale)

    def test_paid_on_defaults_to_today_and_accepts_past_dates(self):
        purchase = self.received(10)
        today = timezone.localdate()

        self.assertEqual(pay(self.supplier, 1000, PaymentMethod.CASH, self.owner, purchase=purchase).paid_on, today)
        yesterday = today - timedelta(days=1)
        payment = pay(self.supplier, 1000, PaymentMethod.CASH, self.owner, purchase=purchase, paid_on=yesterday)
        self.assertEqual(payment.paid_on, yesterday)

    def test_invalid_payments_are_rejected(self):
        purchase = self.received(10)
        tomorrow = timezone.localdate() + timedelta(days=1)
        cases = [
            {"amount": 0, "method": PaymentMethod.CASH},
            {"amount": 1000, "method": "cheque"},
            {"amount": 1000, "method": PaymentMethod.CASH, "paid_on": tomorrow},
        ]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValidationError):
                pay(self.supplier, user=self.owner, purchase=purchase, **case)
        self.assertFalse(SupplierPayment.objects.exists())

    def test_purchase_of_other_supplier_is_rejected(self):
        purchase = self.received(1)
        with self.assertRaises(ValueError):
            pay(Supplier.objects.create(name="Otro"), 1000, PaymentMethod.CASH, self.owner, purchase=purchase)

    def test_database_blocks_paid_above_total(self):
        purchase = self.received(10)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Purchase.objects.filter(pk=purchase.pk).update(paid_amount=100001)


class ReceiveWithPaymentTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.product = make_product()

    def test_abono_delivered_with_the_goods(self):
        purchase = make_purchase(self.owner, items=[(self.product, 10, 10000)])

        purchase.receive(self.owner, payment={"amount": 30000, "method": PaymentMethod.CASH})

        self.assertEqual((purchase.paid_amount, purchase.payment_status), (30000, PaymentStatus.PARTIAL))
        self.assertEqual(purchase.allocations.get().amount, 30000)

    def test_invalid_abono_undoes_the_reception(self):
        purchase = make_purchase(self.owner, items=[(self.product, 10, 10000)])

        with self.assertRaises(Overpayment):
            purchase.receive(self.owner, payment={"amount": 100001, "method": PaymentMethod.CASH})

        purchase.refresh_from_db()
        self.assertEqual(purchase.status, PurchaseStatus.DRAFT)
        self.assertFalse(InventoryMovement.objects.exists())
        self.assertFalse(InventoryBalance.objects.filter(quantity__gt=0).exists())


class RaisedSalePriceTests(TestCase):
    def test_keeps_the_peso_margin_and_closes_in_thousands(self):
        self.assertEqual(raised_sale_price(25000, 18000, 18750), 26000)  # 25.750 -> 26.000
        self.assertEqual(raised_sale_price(25000, 18000, 19000), 26000)  # ya cerrado en mil
        self.assertEqual(raised_sale_price(25000, 18000, 18001), 26000)  # un peso más también cierra arriba

    def test_lower_or_equal_cost_keeps_the_price(self):
        self.assertEqual(raised_sale_price(25500, 18000, 15000), 25500)
        self.assertEqual(raised_sale_price(25500, 18000, 18000), 25500)

    def test_works_from_zero_cost(self):
        self.assertEqual(raised_sale_price(5000, 0, 3200), 9000)  # 8.200 -> 9.000


class ReceivePricingTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.product = make_product(cost_price=18000, sale_price=25000)
        InventoryMovement.objects.record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)

    def receive(self, quantity, unit_cost):
        purchase = make_purchase(self.owner, items=[(self.product, quantity, unit_cost)])
        changes = purchase.receive(self.owner)
        self.product.refresh_from_db()
        return purchase, changes

    def test_higher_cost_raises_the_price_and_records_it(self):
        purchase, changes = self.receive(3, 20000)

        self.assertEqual((self.product.cost_price, self.product.sale_price), (18750, 26000))
        change = PriceChange.objects.get()
        self.assertEqual(changes, [change])
        self.assertEqual((change.old_price, change.new_price, change.changed_by), (25000, 26000, self.owner))
        self.assertEqual(change.reason, f"Compra {purchase.pk} · Distribuidora Andina")

    def test_lower_cost_keeps_the_price(self):
        _, changes = self.receive(3, 15000)

        self.assertEqual((self.product.cost_price, self.product.sale_price), (16875, 25000))
        self.assertEqual(changes, [])
        self.assertFalse(PriceChange.objects.exists())

    def test_failed_reception_does_not_change_the_price(self):
        purchase = make_purchase(self.owner, items=[(self.product, 3, 20000)])

        with self.assertRaises(Overpayment):
            purchase.receive(self.owner, payment={"amount": 60001, "method": PaymentMethod.CASH})

        self.product.refresh_from_db()
        self.assertEqual((self.product.cost_price, self.product.sale_price), (18000, 25000))
        self.assertFalse(PriceChange.objects.exists())
