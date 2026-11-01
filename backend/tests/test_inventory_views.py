from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Role
from apps.catalog.models import Category
from apps.inventory.models import InitialCount, InventoryMovement, MovementKind

from .helpers import APP_TOKEN, login_client, make_user
from .test_catalog_models import make_product

JSON = "application/json"
record = InventoryMovement.objects.record


class InventoryApiMixin:
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)
        self.product = make_product(cost_price=18000)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class MovementListTests(InventoryApiMixin, TestCase):
    def test_lists_newest_first_and_hides_cost_from_seller(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        record(self.product, MovementKind.ADJUSTMENT, -1, self.owner, reason="Se dañó")

        login_client(self.client, self.seller)
        data = self.client.get("/api/v1/inventory/movements").json()

        self.assertEqual(data["count"], 2)
        self.assertEqual([m["kind"] for m in data["results"]], ["adjustment", "initial_count"])
        self.assertNotIn("unit_cost", data["results"][0])

    def test_filters_by_product_kind_and_date(self):
        other = make_product(code="ELE-UNI-BUJ", name="Bujía")
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        record(other, MovementKind.INITIAL_COUNT, 3, self.owner)
        record(other, MovementKind.ADJUSTMENT, 1, self.owner, reason="Sobrante")
        old = record(other, MovementKind.PURCHASE, 2, self.owner)
        InventoryMovement.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=10))
        today = timezone.localdate().isoformat()

        def codes(query):
            return [(m["product"]["code"], m["kind"]) for m in self.client.get(f"/api/v1/inventory/movements?{query}").json()["results"]]

        self.assertEqual(len(codes(f"product={other.pk}")), 3)
        self.assertEqual(codes("kind=adjustment"), [("ELE-UNI-BUJ", "adjustment")])
        self.assertEqual(len(codes(f"date_from={today}")), 3)
        self.assertEqual(codes(f"date_to={(timezone.localdate() - timedelta(days=1)).isoformat()}"), [("ELE-UNI-BUJ", "purchase")])

    def test_invalid_filters_respond_400(self):
        for query, field in [("kind=robo", "kind"), ("date_from=31/10/2026", "date_from"), ("product=abc", "product")]:
            with self.subTest(query):
                response = self.client.get(f"/api/v1/inventory/movements?{query}")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()["fields"])


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class AdjustmentViewTests(InventoryApiMixin, TestCase):
    def test_owner_adjusts_and_product_shows_new_stock(self):
        record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)

        response = self.client.post(
            "/api/v1/inventory/adjustments",
            {"product": self.product.pk, "quantity": -2, "reason": "Conteo de fin de mes"}, content_type=JSON,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["balance_after"], 3)
        self.assertEqual(self.client.get(f"/api/v1/products/{self.product.pk}").json()["stock"], 3)

    def test_cannot_leave_stock_negative(self):
        response = self.client.post(
            "/api/v1/inventory/adjustments",
            {"product": self.product.pk, "quantity": -1, "reason": "Se perdió"}, content_type=JSON,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["quantity"], ["Solo hay 0 unidades: no se pueden restar 1."])

    def test_seller_cannot_adjust(self):
        login_client(self.client, self.seller)

        response = self.client.post(
            "/api/v1/inventory/adjustments",
            {"product": self.product.pk, "quantity": 1, "reason": "x"}, content_type=JSON,
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(InventoryMovement.objects.exists())


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class InitialCountViewTests(InventoryApiMixin, TestCase):
    def item(self, **extra):
        payload = {
            "name": "Bujía NGK C7HSA", "category": Category.objects.create(name="Eléctrico", abbreviation="ELE").pk,
            "cost_price": 6000, "sale_price": 9000, "quantity": 12,
        }
        payload.update(extra)
        return self.client.post("/api/v1/inventory/initial-count/items", payload, content_type=JSON)

    def test_full_flow(self):
        login_client(self.client, self.seller)
        self.assertEqual(self.client.get("/api/v1/inventory/initial-count").json()["is_open"], True)

        login_client(self.client, self.owner)
        response = self.item()
        self.assertEqual(response.status_code, 201)
        self.assertEqual((response.json()["code"], response.json()["stock"]), ("ELE-UNI-BUJ", 12))

        response = self.client.post("/api/v1/inventory/initial-count/finish")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual((data["is_open"], data["finished_by"]), (False, "dueno"))
        self.assertEqual((data["products_counted"], data["units_counted"]), (1, 12))

    def test_after_finishing_responds_409(self):
        self.client.post("/api/v1/inventory/initial-count/finish")

        for response in (self.client.post("/api/v1/inventory/initial-count/finish"), self.item()):
            with self.subTest(response.request["PATH_INFO"]):
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.json()["code"], "initial_count_finished")
        self.assertEqual(InitialCount.load().finished_by, self.owner)

    def test_seller_cannot_load_or_finish(self):
        login_client(self.client, self.seller)

        self.assertEqual(self.item().status_code, 403)
        self.assertEqual(self.client.post("/api/v1/inventory/initial-count/finish").status_code, 403)
        self.assertTrue(InitialCount.load().is_open)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class ProductStockInCatalogTests(InventoryApiMixin, TestCase):
    def test_search_and_list_include_stock_without_extra_queries(self):
        for i in range(3):
            product = make_product(code=f"FRE-PUL-PAS{i + 2}", name=f"Pastillas {i}")
            record(product, MovementKind.INITIAL_COUNT, i + 1, self.owner)

        # Sesión, total, página (con la existencia en el mismo JOIN) y motos compatibles: no una por producto.
        with self.assertNumQueries(4):
            self.client.get("/api/v1/products")
        results = self.client.get("/api/v1/catalog/search?q=pastillas").json()
        self.assertEqual({p["code"]: p["stock"] for p in results}["FRE-PUL-PAS"], 0)
        self.assertEqual({p["code"]: p["stock"] for p in results}["FRE-PUL-PAS4"], 3)
