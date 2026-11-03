from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role
from apps.inventory.models import InventoryBalance
from apps.purchases.exceptions import PurchaseReceived
from apps.purchases.models import PaymentMethod, Purchase, PurchaseStatus, Supplier, SupplierPayment
from apps.purchases.serializers import (
    PurchaseSerializer, PurchaseWriteSerializer, ReceivePurchaseSerializer, SupplierPaymentWriteSerializer,
    SupplierSerializer, pesos,
)

from .helpers import make_user, open_cash
from .test_catalog_models import make_product
from .test_catalog_serializers import context_for
from .test_purchases_models import make_purchase


class PurchaseDataMixin:
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.supplier = Supplier.objects.create(name="Distribuidora Andina")
        self.brakes = make_product(cost_price=18000)
        self.plug = make_product(code="ELE-UNI-BUJ", name="Bujía NGK", cost_price=9000)

    def write(self, data, instance=None, **kwargs):
        serializer = PurchaseWriteSerializer(instance, data=data, context=context_for(self.owner), **kwargs)
        serializer.is_valid(raise_exception=True)
        return serializer.save(), serializer.data

    def received(self, units, unit_cost=10000):
        purchase = make_purchase(self.owner, supplier=self.supplier, items=[(self.brakes, units, unit_cost)])
        purchase.receive(self.owner)
        return purchase


class PesosTests(TestCase):
    def test_formats_with_dots(self):
        self.assertEqual(pesos(25000), "$25.000")
        self.assertEqual(pesos(1250000), "$1.250.000")
        self.assertEqual(pesos(0), "$0")


class SupplierSerializerTests(PurchaseDataMixin, TestCase):
    def test_creates_with_clean_text_and_no_debt(self):
        serializer = SupplierSerializer(data={"name": " Motorepuestos   Sur ", "phone": " 300  123 4567 "})
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save()

        self.assertEqual((supplier.name, supplier.phone), ("Motorepuestos Sur", "300 123 4567"))
        self.assertEqual(serializer.data["balance_due"], 0)

    def test_duplicate_name_is_rejected(self):
        serializer = SupplierSerializer(data={"name": "DISTRIBUIDORA ANDINA"})

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["name"], ["Ya existe un proveedor con ese nombre."])

    def test_balance_due_shows_the_debt(self):
        self.received(3)

        self.assertEqual(SupplierSerializer(self.supplier).data["balance_due"], 30000)


class PurchaseWriteTests(PurchaseDataMixin, TestCase):
    def test_creates_draft_with_items(self):
        purchase, data = self.write({
            "supplier": self.supplier.pk, "document_number": " FV  1020 ",
            "items": [
                {"product": self.brakes.pk, "quantity": 3, "unit_cost": 20000},
                {"product": self.plug.pk, "quantity": 10, "unit_cost": 0},  # regalo del proveedor
            ],
        })

        self.assertEqual((purchase.status, purchase.created_by), (PurchaseStatus.DRAFT, self.owner))
        self.assertEqual(data["document_number"], "FV 1020")
        self.assertEqual(data["total"], 60000)  # en borrador: suma de las líneas
        self.assertEqual((data["paid_amount"], data["payment_status"]), (0, None))
        self.assertEqual([item["subtotal"] for item in data["items"]], [60000, 0])
        self.assertFalse(InventoryBalance.objects.exists())

    def test_items_sent_replace_previous_ones(self):
        purchase, _ = self.write({
            "supplier": self.supplier.pk, "items": [{"product": self.brakes.pk, "quantity": 3, "unit_cost": 20000}],
        })

        _, data = self.write(
            {"items": [{"product": self.plug.pk, "quantity": 2, "unit_cost": 9500}]}, instance=purchase, partial=True,
        )

        self.assertEqual([item["product"]["code"] for item in data["items"]], ["ELE-UNI-BUJ"])
        self.assertEqual(data["total"], 19000)

    def test_editing_without_items_keeps_them(self):
        purchase, _ = self.write({
            "supplier": self.supplier.pk, "items": [{"product": self.brakes.pk, "quantity": 3, "unit_cost": 20000}],
        })

        _, data = self.write({"notes": "Llegó incompleta la caja"}, instance=purchase, partial=True)

        self.assertEqual(len(data["items"]), 1)

    def test_invalid_items_are_rejected(self):
        self.plug.is_active = False
        self.plug.save()
        cases = [
            [{"product": self.brakes.pk, "quantity": 0, "unit_cost": 20000}],
            [{"product": self.brakes.pk, "quantity": 1, "unit_cost": -1}],
            [{"product": self.plug.pk, "quantity": 1, "unit_cost": 9000}],
        ]
        for items in cases:
            with self.subTest(items=items):
                serializer = PurchaseWriteSerializer(
                    data={"supplier": self.supplier.pk, "items": items}, context=context_for(self.owner),
                )
                self.assertFalse(serializer.is_valid())
                self.assertIn("items", serializer.errors)

    def test_repeated_product_is_rejected(self):
        line = {"product": self.brakes.pk, "quantity": 1, "unit_cost": 20000}
        serializer = PurchaseWriteSerializer(
            data={"supplier": self.supplier.pk, "items": [line, line]}, context=context_for(self.owner),
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("FRE-PUL-PAS está repetido", str(serializer.errors["items"]))

    def test_repeated_document_is_rejected(self):
        self.write({"supplier": self.supplier.pk, "document_number": "FV-1020"})
        serializer = PurchaseWriteSerializer(
            data={"supplier": self.supplier.pk, "document_number": "fv-1020"}, context=context_for(self.owner),
        )

        self.assertFalse(serializer.is_valid())
        self.assertEqual(
            serializer.errors["document_number"], ["Ya hay una compra de este proveedor con ese documento."],
        )

    def test_inactive_supplier_is_rejected(self):
        self.supplier.is_active = False
        self.supplier.save()
        serializer = PurchaseWriteSerializer(data={"supplier": self.supplier.pk}, context=context_for(self.owner))

        self.assertFalse(serializer.is_valid())
        self.assertIn("supplier", serializer.errors)

    def test_received_purchase_cannot_be_edited(self):
        purchase = self.received(1)

        with self.assertRaises(PurchaseReceived):
            self.write({"notes": "cambio"}, instance=purchase, partial=True)


class ReceivePurchaseSerializerTests(PurchaseDataMixin, TestCase):
    def receive(self, purchase, data):
        serializer = ReceivePurchaseSerializer(purchase, data=data, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def draft(self):
        return make_purchase(self.owner, supplier=self.supplier, items=[(self.brakes, 10, 10000)])

    def test_receive_without_payment_leaves_the_whole_debt(self):
        data = self.receive(self.draft(), {})

        self.assertEqual((data["status"], data["total"], data["balance_due"]), ("received", 100000, 100000))
        self.assertEqual(data["payment_status"], "pending")

    def test_receive_with_abono(self):
        data = self.receive(self.draft(), {"payment": {"amount": 30000, "method": "cash"}})

        self.assertEqual((data["paid_amount"], data["balance_due"], data["payment_status"]), (30000, 70000, "partial"))
        self.assertEqual(data["allocations"][0]["amount"], 30000)
        self.assertEqual(data["allocations"][0]["method_label"], "Efectivo")

    def test_abono_above_total_is_rejected_and_nothing_is_received(self):
        purchase = self.draft()

        with self.assertRaises(ValidationError) as ctx:
            self.receive(purchase, {"payment": {"amount": 100001, "method": "cash"}})

        self.assertEqual(
            ctx.exception.detail["payment"]["amount"], ["Se deben $100.000: no se pueden abonar $100.001."],
        )
        purchase.refresh_from_db()
        self.assertEqual(purchase.status, PurchaseStatus.DRAFT)

    def test_empty_purchase_cannot_be_received(self):
        with self.assertRaises(ValidationError) as ctx:
            self.receive(make_purchase(self.owner, supplier=self.supplier), {})

        self.assertEqual(ctx.exception.detail["non_field_errors"], ["La compra no tiene productos."])

    def test_second_receive_is_a_conflict(self):
        purchase = self.draft()
        self.receive(purchase, {})

        with self.assertRaises(PurchaseReceived):
            self.receive(purchase, {})


class SupplierPaymentWriteTests(PurchaseDataMixin, TestCase):
    def pay(self, data):
        serializer = SupplierPaymentWriteSerializer(data=data, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return serializer.data

    def test_abono_to_the_supplier_pays_oldest_first(self):
        first = self.received(3)   # 30.000
        second = self.received(5)  # 50.000

        data = self.pay({"supplier": self.supplier.pk, "amount": 45000, "method": "transfer"})

        self.assertEqual(data["paid_on"], str(timezone.localdate()))
        self.assertEqual(data["method_label"], "Transferencia")
        self.assertEqual(
            [(a["purchase"], a["amount"]) for a in data["allocations"]], [(first.pk, 30000), (second.pk, 15000)],
        )
        self.assertEqual(SupplierSerializer(self.supplier).data["balance_due"], 35000)

    def test_abono_to_one_purchase(self):
        self.received(3)
        second = self.received(5)

        data = self.pay({"supplier": self.supplier.pk, "purchase": second.pk, "amount": 50000, "method": "cash"})

        self.assertEqual([a["purchase"] for a in data["allocations"]], [second.pk])
        second.refresh_from_db()
        self.assertEqual(PurchaseSerializer(second).data["payment_status"], "paid")

    def test_errors_are_shown_on_their_field(self):
        purchase = self.received(3)
        draft = make_purchase(self.owner, supplier=self.supplier, items=[(self.brakes, 1, 1000)])
        other = make_purchase(self.owner, supplier=Supplier.objects.create(name="Otro"), items=[(self.brakes, 1, 1)])
        tomorrow = timezone.localdate() + timedelta(days=1)
        base = {"supplier": self.supplier.pk, "amount": 1000, "method": "cash"}
        cases = [
            ({"amount": 30001}, "amount", "Se deben $30.000: no se pueden abonar $30.001."),
            ({"purchase": purchase.pk, "amount": 0}, "amount", None),
            ({"method": "cheque"}, "method", None),
            ({"paid_on": str(tomorrow)}, "paid_on", "La fecha de pago no puede ser futura."),
            ({"purchase": other.pk}, "purchase", "La compra es de otro proveedor."),
            ({"purchase": draft.pk}, "purchase", "La compra todavía es borrador: recíbela antes de abonar."),
        ]
        for extra, field, message in cases:
            with self.subTest(extra=extra), self.assertRaises(ValidationError) as ctx:
                self.pay({**base, **extra})
            self.assertIn(field, ctx.exception.detail)
            if message:
                self.assertEqual(ctx.exception.detail[field], [message])
        self.assertFalse(SupplierPayment.objects.exists())

    def test_supplier_without_debt_cannot_receive_abonos(self):
        with self.assertRaises(ValidationError) as ctx:
            self.pay({"supplier": self.supplier.pk, "amount": 1000, "method": PaymentMethod.CASH})

        self.assertEqual(ctx.exception.detail["amount"], ["No hay saldo pendiente: no se puede abonar."])

    def test_past_date_is_kept(self):
        self.received(3)
        yesterday = timezone.localdate() - timedelta(days=1)

        data = self.pay({"supplier": self.supplier.pk, "amount": 1000, "method": "cash", "paid_on": str(yesterday)})

        self.assertEqual(data["paid_on"], str(yesterday))


class PurchaseListTests(PurchaseDataMixin, TestCase):
    def test_list_row_shows_debt_and_count(self):
        purchase = self.received(3)
        purchase = Purchase.objects.prefetch_related("items").get(pk=purchase.pk)

        data = PurchaseSerializer(purchase).data

        self.assertEqual(data["supplier"], {"id": self.supplier.pk, "name": "Distribuidora Andina"})
        self.assertEqual((data["total"], data["balance_due"], data["items_count"]), (30000, 30000, 1))
        self.assertEqual((data["status_label"], data["received_by"]), ("Recibida", "dueno"))


class ReceivePriceChangesTests(PurchaseDataMixin, TestCase):
    def test_response_lists_the_raised_prices(self):
        purchase = make_purchase(
            self.owner, supplier=self.supplier, items=[(self.brakes, 3, 20000), (self.plug, 2, 8000)],
        )
        serializer = ReceivePurchaseSerializer(purchase, data={}, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Pastillas: sin existencias, el costo pasa de 18.000 a 20.000 y la venta de 25.000 a 27.000.
        # Bujía: el costo baja de 9.000 a 8.000 y su precio no cambia.
        self.assertEqual(serializer.data["price_changes"], [
            {"product": {"id": self.brakes.pk, "code": "FRE-PUL-PAS", "name": self.brakes.name},
             "old_price": 25000, "new_price": 27000},
        ])
