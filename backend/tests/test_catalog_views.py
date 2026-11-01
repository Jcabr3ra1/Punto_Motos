from django.test import TestCase, override_settings

from apps.accounts.models import Role
from apps.catalog.models import Brand, Category, MotoModel, Product

from .helpers import APP_TOKEN, login_client, make_user

JSON = "application/json"


class CatalogApiMixin:
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)
        self.brakes = Category.objects.create(name="Frenos", abbreviation="FRE")
        self.electric = Category.objects.create(name="Eléctrico", abbreviation="ELE")
        self.pulsar = MotoModel.objects.create(name="Pulsar 180", abbreviation="PUL")
        self.discover = MotoModel.objects.create(name="Discover 125", abbreviation="DIS")

    def product(self, code, name, category=None, moto=None, **extra):
        defaults = {"cost_price": 10000, "sale_price": 15000}
        defaults.update(extra)
        return Product.objects.create(code=code, name=name, category=category or self.brakes, moto=moto, **defaults)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class NamedCatalogViewTests(CatalogApiMixin, TestCase):
    def test_list_hides_inactive_unless_requested(self):
        Brand.objects.create(name="Bajaj")
        Brand.objects.create(name="Vieja", is_active=False)

        self.assertEqual([b["name"] for b in self.client.get("/api/v1/catalog/brands").json()], ["Bajaj"])
        all_brands = self.client.get("/api/v1/catalog/brands?include_inactive=true").json()
        self.assertEqual([b["name"] for b in all_brands], ["Bajaj", "Vieja"])

    def test_owner_creates_and_seller_cannot(self):
        response = self.client.post("/api/v1/catalog/motos", {"name": "Boxer CT 100", "abbreviation": "box"}, content_type=JSON)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["abbreviation"], "BOX")

        login_client(self.client, self.seller)
        self.assertEqual(self.client.get("/api/v1/catalog/motos").status_code, 200)
        response = self.client.post("/api/v1/catalog/motos", {"name": "Otra", "abbreviation": "OTR"}, content_type=JSON)
        self.assertEqual(response.status_code, 403)

    def test_cannot_delete(self):
        response = self.client.delete(f"/api/v1/catalog/categories/{self.brakes.pk}")

        self.assertEqual(response.status_code, 405)

    def test_requires_login(self):
        login_client(self.client)

        self.assertEqual(self.client.get("/api/v1/catalog/categories").status_code, 401)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class ProductViewTests(CatalogApiMixin, TestCase):
    def test_owner_creates_product_with_generated_code(self):
        response = self.client.post("/api/v1/products", {
            "name": "Pastillas de freno Pulsar 180", "category": self.brakes.pk, "moto": self.pulsar.pk,
            "compatible_motos": [self.discover.pk], "cost_price": 18000, "sale_price": 25000,
        }, content_type=JSON)

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["code"], "FRE-PUL-PAS")
        self.assertEqual(body["moto"]["name"], "Pulsar 180")
        self.assertEqual([m["name"] for m in body["compatible_motos"]], ["Discover 125"])
        self.assertEqual(body["cost_price"], 18000)

    def test_seller_cannot_create_or_change_prices(self):
        product = self.product("FRE-PUL-PAS", "Pastillas")
        login_client(self.client, self.seller)

        response = self.client.patch(f"/api/v1/products/{product.pk}", {"sale_price": 1}, content_type=JSON)

        self.assertEqual(response.status_code, 403)
        product.refresh_from_db()
        self.assertEqual(product.sale_price, 15000)

    def test_seller_list_has_no_costs(self):
        self.product("FRE-PUL-PAS", "Pastillas")
        login_client(self.client, self.seller)

        result = self.client.get("/api/v1/products").json()["results"][0]

        self.assertNotIn("cost_price", result)

    def test_list_is_paginated(self):
        for i in range(3):
            self.product(f"FRE-PUL-P{i}", f"Producto {i}")

        body = self.client.get("/api/v1/products?page_size=2").json()

        self.assertEqual(body["count"], 3)
        self.assertEqual(len(body["results"]), 2)
        self.assertIsNotNone(body["next"])

    def test_filters(self):
        self.product("FRE-PUL-PAS", "Pastillas", moto=self.pulsar)
        compatible = self.product("FRE-UNI-LIQ", "Líquido de frenos", is_workshop_supply=True)
        compatible.compatible_motos.add(self.discover)
        self.product("ELE-UNI-BUJ", "Bujía", category=self.electric)

        def codes(query):
            return [p["code"] for p in self.client.get(f"/api/v1/products?{query}").json()["results"]]

        self.assertEqual(codes(f"category={self.electric.pk}"), ["ELE-UNI-BUJ"])
        self.assertEqual(codes(f"moto={self.discover.pk}"), ["FRE-UNI-LIQ"])
        self.assertEqual(codes("workshop_supply=true"), ["FRE-UNI-LIQ"])
        self.assertEqual(codes("q=pastillas pulsar"), ["FRE-PUL-PAS"])
        self.assertEqual(codes("ordering=-code"), ["FRE-UNI-LIQ", "FRE-PUL-PAS", "ELE-UNI-BUJ"])

    def test_invalid_filter_returns_400(self):
        response = self.client.get("/api/v1/products?category=abc")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["category"], ["Debe ser un número."])


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SearchViewTests(CatalogApiMixin, TestCase):
    def setUp(self):
        super().setUp()
        login_client(self.client, self.seller)
        self.exact = self.product("FRE-PUL-PAS", "Pastillas de freno Pulsar 180", moto=self.pulsar)
        self.prefix = self.product("FRE-PUL-PAS2", "Pastillas traseras Pulsar", moto=self.pulsar)
        self.by_name = self.product("FRE-DIS-ZAP", "Zapatas", moto=self.discover)
        self.by_name.compatible_motos.add(self.pulsar)

    def search(self, text):
        return [p["code"] for p in self.client.get("/api/v1/catalog/search", {"q": text}).json()]

    def test_exact_code_comes_first_without_dashes(self):
        self.assertEqual(self.search("frepulpas")[:2], ["FRE-PUL-PAS", "FRE-PUL-PAS2"])

    def test_code_prefix(self):
        self.assertEqual(self.search("fre-pu"), ["FRE-PUL-PAS", "FRE-PUL-PAS2"])

    def test_words_match_name_and_compatible_motos(self):
        self.assertEqual(self.search("pulsar"), ["FRE-PUL-PAS", "FRE-PUL-PAS2", "FRE-DIS-ZAP"])
        self.assertEqual(self.search("zapatas pulsar"), ["FRE-DIS-ZAP"])

    def test_ignores_accents_and_case(self):
        ngk = Brand.objects.create(name="NGK")
        self.product("ELE-UNI-BUJ", "Bujía C7HSA", category=self.electric, brand=ngk)
        self.product("TRA-PUL-PIN", "Piñón 14 dientes", moto=self.pulsar)

        for text in ["bujia", "BUJÍA", "bujía", "Bujia"]:
            with self.subTest(text=text):
                self.assertEqual(self.search(text), ["ELE-UNI-BUJ"])
        self.assertEqual(self.search("pinon"), ["TRA-PUL-PIN"])

    def test_words_can_match_brand(self):
        ngk = Brand.objects.create(name="NGK")
        self.product("ELE-UNI-BUJ", "Bujía C7HSA", category=self.electric, brand=ngk)

        self.assertEqual(self.search("bujia ngk"), ["ELE-UNI-BUJ"])

    def test_renamed_moto_is_found_by_new_name(self):
        self.discover.name = "Discover Ñandú"
        self.discover.save()

        self.assertEqual(self.search("nandu"), ["FRE-DIS-ZAP"])

    def test_needs_two_characters(self):
        self.assertEqual(self.search("f"), [])

    def test_returns_at_most_eight_active_products(self):
        for i in range(10):
            self.product(f"FRE-PUL-X{i}", f"Pastilla {i}", moto=self.pulsar)
        self.product("FRE-PUL-OFF", "Pastilla vieja", moto=self.pulsar, is_active=False)

        results = self.search("pastilla")

        self.assertEqual(len(results), 8)
        self.assertNotIn("FRE-PUL-OFF", results)

    def test_seller_does_not_see_costs(self):
        result = self.client.get("/api/v1/catalog/search", {"q": "frepulpas"}).json()[0]

        self.assertNotIn("cost_price", result)
        self.assertEqual(result["sale_price"], 15000)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class CodeSuggestionViewTests(CatalogApiMixin, TestCase):
    def test_owner_gets_suggestion(self):
        self.product("FRE-PUL-PAS", "Pastillas")

        response = self.client.get(
            "/api/v1/catalog/code-suggestion",
            {"category": self.brakes.pk, "name": "Pastillas traseras", "moto": self.pulsar.pk},
        )

        self.assertEqual(response.json(), {"code": "FRE-PUL-PAS2"})

    def test_missing_category_returns_field_error(self):
        response = self.client.get("/api/v1/catalog/code-suggestion", {"name": "Pastillas"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("category", response.json()["fields"])

    def test_seller_cannot_ask_for_suggestions(self):
        login_client(self.client, self.seller)

        response = self.client.get("/api/v1/catalog/code-suggestion", {"category": self.brakes.pk, "name": "X"})

        self.assertEqual(response.status_code, 403)
