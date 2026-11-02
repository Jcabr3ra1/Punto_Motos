from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Role
from apps.inventory.models import InventoryBalance
from apps.purchases.models import Purchase, PurchaseStatus, Supplier, SupplierPayment

from .helpers import APP_TOKEN, login_client, make_user
from .test_catalog_models import make_product
from .test_purchases_models import make_purchase

JSON = "application/json"


class PurchaseApiMixin:
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)
        self.supplier = Supplier.objects.create(name="Distribuidora Andina")
        self.product = make_product(cost_price=18000, sale_price=25000)

    def received(self, units, unit_cost=10000, supplier=None):
        purchase = make_purchase(self.owner, supplier=supplier or self.supplier, items=[(self.product, units, unit_cost)])
        purchase.receive(self.owner)
        return purchase

    def post(self, url, data=None):
        return self.client.post(url, data or {}, content_type=JSON)

    def patch(self, url, data):
        return self.client.patch(url, data, content_type=JSON)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class PermissionTests(PurchaseApiMixin, TestCase):
    def test_seller_cannot_see_or_touch_purchases(self):
        purchase = self.received(1)
        login_client(self.client, self.seller)

        for method, url in [
            ("get", "/api/v1/suppliers"),
            ("get", f"/api/v1/suppliers/{self.supplier.pk}"),
            ("get", "/api/v1/purchases"),
            ("get", f"/api/v1/purchases/{purchase.pk}"),
            ("post", "/api/v1/purchases"),
            ("post", f"/api/v1/purchases/{purchase.pk}/receive"),
            ("get", "/api/v1/supplier-payments"),
            ("post", "/api/v1/supplier-payments"),
        ]:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, content_type=JSON)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["code"], "permission_denied")

    def test_without_session_is_401(self):
        login_client(self.client)

        self.assertEqual(self.client.get("/api/v1/purchases").status_code, 401)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SupplierApiTests(PurchaseApiMixin, TestCase):
    def test_create_edit_and_deactivate(self):
        response = self.post("/api/v1/suppliers", {"name": "Motorepuestos Sur", "tax_id": "900123456-1"})
        self.assertEqual(response.status_code, 201)
        supplier_id = response.json()["id"]
        self.assertEqual(response.json()["balance_due"], 0)

        response = self.patch(f"/api/v1/suppliers/{supplier_id}", {"is_active": False})
        self.assertEqual(response.status_code, 200)

        names = [s["name"] for s in self.client.get("/api/v1/suppliers").json()]
        self.assertEqual(names, ["Distribuidora Andina"])
        names = [s["name"] for s in self.client.get("/api/v1/suppliers?include_inactive=true").json()]
        self.assertEqual(names, ["Distribuidora Andina", "Motorepuestos Sur"])

    def test_no_delete(self):
        self.assertEqual(self.client.delete(f"/api/v1/suppliers/{self.supplier.pk}").status_code, 405)

    def test_list_shows_debt_and_filters(self):
        other = Supplier.objects.create(name="Lubricantes Óptimos", tax_id="800555")
        self.received(3)  # 30.000
        self.received(2)  # 20.000
        make_purchase(self.owner, supplier=other, items=[(self.product, 9, 1000)])  # borrador: no es deuda

        data = {s["name"]: s["balance_due"] for s in self.client.get("/api/v1/suppliers").json()}
        self.assertEqual(data, {"Distribuidora Andina": 50000, "Lubricantes Óptimos": 0})

        cases = [("?with_debt=true", ["Distribuidora Andina"]), ("?q=optimos", ["Lubricantes Óptimos"]),
                 ("?q=800555", ["Lubricantes Óptimos"])]
        for query, expected in cases:
            with self.subTest(query=query):
                names = [s["name"] for s in self.client.get(f"/api/v1/suppliers{query}").json()]
                self.assertEqual(names, expected)

        self.assertEqual(self.client.get(f"/api/v1/suppliers/{self.supplier.pk}").json()["balance_due"], 50000)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class PurchaseApiTests(PurchaseApiMixin, TestCase):
    def test_full_cycle_draft_edit_receive_and_pay(self):
        response = self.post("/api/v1/purchases", {
            "supplier": self.supplier.pk, "document_number": "FV-1020",
            "items": [{"product": self.product.pk, "quantity": 3, "unit_cost": 20000}],
        })
        self.assertEqual(response.status_code, 201)
        purchase_id = response.json()["id"]
        self.assertEqual((response.json()["status"], response.json()["total"]), ("draft", 60000))

        response = self.patch(
            f"/api/v1/purchases/{purchase_id}", {"items": [{"product": self.product.pk, "quantity": 4, "unit_cost": 20000}]},
        )
        self.assertEqual(response.json()["total"], 80000)

        response = self.post(f"/api/v1/purchases/{purchase_id}/receive", {"payment": {"amount": 30000, "method": "cash"}})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual((data["status"], data["paid_amount"], data["balance_due"]), ("received", 30000, 50000))
        self.assertEqual(data["payment_status"], "partial")
        # Sin existencias: el costo pasa de 18.000 a 20.000 y la venta de 25.000 a 27.000.
        self.assertEqual([(c["old_price"], c["new_price"]) for c in data["price_changes"]], [(25000, 27000)])
        self.assertEqual(InventoryBalance.objects.get(product=self.product).quantity, 4)

        response = self.post("/api/v1/supplier-payments", {"supplier": self.supplier.pk, "amount": 50000, "method": "transfer"})
        self.assertEqual(response.status_code, 201)
        detail = self.client.get(f"/api/v1/purchases/{purchase_id}").json()
        self.assertEqual((detail["payment_status"], detail["balance_due"]), ("paid", 0))
        self.assertEqual([a["amount"] for a in detail["allocations"]], [30000, 50000])

    def test_received_purchase_is_locked(self):
        purchase = self.received(1)

        for response in [
            self.patch(f"/api/v1/purchases/{purchase.pk}", {"notes": "cambio"}),
            self.post(f"/api/v1/purchases/{purchase.pk}/receive"),
            self.client.delete(f"/api/v1/purchases/{purchase.pk}"),
        ]:
            with self.subTest(response=response):
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["code"], "purchase_received")
        self.assertEqual(InventoryBalance.objects.get(product=self.product).quantity, 1)

    def test_draft_can_be_deleted(self):
        draft = make_purchase(self.owner, supplier=self.supplier, items=[(self.product, 1, 1000)])

        self.assertEqual(self.client.delete(f"/api/v1/purchases/{draft.pk}").status_code, 204)
        self.assertFalse(Purchase.objects.exists())

    def test_put_is_not_allowed(self):
        draft = make_purchase(self.owner, supplier=self.supplier)

        response = self.client.put(f"/api/v1/purchases/{draft.pk}", {}, content_type=JSON)
        self.assertEqual(response.status_code, 405)

    def test_empty_draft_cannot_be_received(self):
        draft = make_purchase(self.owner, supplier=self.supplier)

        response = self.post(f"/api/v1/purchases/{draft.pk}/receive")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["non_field_errors"], ["La compra no tiene productos."])

    def test_list_filters(self):
        other = Supplier.objects.create(name="Motorepuestos Sur")
        pending = self.received(3)
        partial = self.received(2)
        SupplierPayment.objects.record(self.supplier, 5000, "cash", self.owner, purchase=partial)
        paid = self.received(1)
        SupplierPayment.objects.record(self.supplier, 10000, "cash", self.owner, purchase=paid)
        draft = make_purchase(self.owner, supplier=other, items=[(self.product, 1, 1000)])
        old = self.received(1, supplier=other)
        Purchase.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=10))
        today = timezone.localdate().isoformat()

        cases = [
            (f"?supplier={other.pk}", [draft, old]),
            ("?status=draft", [draft]),
            ("?payment_status=pending,partial", [partial, pending, old]),
            ("?payment_status=paid", [paid]),
            (f"?date_from={today}", [paid, partial, pending, draft]),
        ]
        for query, expected in cases:
            with self.subTest(query=query):
                data = self.client.get(f"/api/v1/purchases{query}").json()
                self.assertEqual(sorted(p["id"] for p in data["results"]), sorted(p.pk for p in expected))

        data = self.client.get("/api/v1/purchases").json()
        self.assertEqual(data["count"], 5)
        self.assertEqual(data["results"][-1]["id"], old.pk)  # la más antigua al final

    def test_invalid_filters_are_400(self):
        for query in ["?status=perdida", "?payment_status=pending,debe", "?supplier=abc", "?date_from=01-11-2026"]:
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/v1/purchases{query}").status_code, 400)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SupplierPaymentApiTests(PurchaseApiMixin, TestCase):
    def test_abono_without_purchase_pays_oldest_first(self):
        first = self.received(3)   # 30.000
        second = self.received(5)  # 50.000

        response = self.post("/api/v1/supplier-payments", {"supplier": self.supplier.pk, "amount": 45000, "method": "cash"})

        self.assertEqual(response.status_code, 201)
        allocations = [(a["purchase"], a["amount"]) for a in response.json()["allocations"]]
        self.assertEqual(allocations, [(first.pk, 30000), (second.pk, 15000)])
        self.assertEqual(self.client.get(f"/api/v1/suppliers/{self.supplier.pk}").json()["balance_due"], 35000)

    def test_overpayment_is_400_on_amount(self):
        self.received(3)

        response = self.post("/api/v1/supplier-payments", {"supplier": self.supplier.pk, "amount": 30001, "method": "cash"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["amount"], ["Se deben $30.000: no se pueden abonar $30.001."])
        self.assertFalse(SupplierPayment.objects.exists())

    def test_list_filters_and_no_edit(self):
        other = Supplier.objects.create(name="Motorepuestos Sur")
        self.received(3)
        self.received(3, supplier=other)
        yesterday = timezone.localdate() - timedelta(days=1)
        old = SupplierPayment.objects.record(self.supplier, 1000, "cash", self.owner, paid_on=yesterday)
        recent = SupplierPayment.objects.record(self.supplier, 2000, "cash", self.owner)
        SupplierPayment.objects.record(other, 3000, "cash", self.owner)

        data = self.client.get(f"/api/v1/supplier-payments?supplier={self.supplier.pk}").json()
        self.assertEqual([p["id"] for p in data["results"]], [recent.pk, old.pk])
        data = self.client.get(f"/api/v1/supplier-payments?date_to={yesterday.isoformat()}").json()
        self.assertEqual([p["id"] for p in data["results"]], [old.pk])

        self.assertEqual(self.patch(f"/api/v1/supplier-payments/{old.pk}", {"amount": 5}).status_code, 405)
        self.assertEqual(self.client.delete(f"/api/v1/supplier-payments/{old.pk}").status_code, 405)
