from django.test import TestCase, override_settings

from apps.catalog.models import Brand, PriceChange, Product
from apps.inventory.models import InventoryMovement, MovementKind

from .helpers import APP_TOKEN, login_client
from .test_catalog_views import JSON, CatalogApiMixin

PRODUCTS = "/api/v1/products"


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class DeleteProductTests(CatalogApiMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.pads = self.product("FRE-PUL-PAS", "Pastillas", moto=self.pulsar)
        self.pads.compatible_motos.add(self.discover)

    def delete(self, pk=None):
        return self.client.delete(f"{PRODUCTS}/{pk or self.pads.pk}")

    def test_owner_deletes_unused_product_and_its_code_is_free_again(self):
        self.assertEqual(self.delete().status_code, 204)

        self.assertFalse(Product.objects.filter(pk=self.pads.pk).exists())
        self.assertEqual(self.client.get(f"{PRODUCTS}/{self.pads.pk}").status_code, 404)
        self.product("FRE-PUL-PAS", "Otra cosa")

    def test_product_with_inventory_movement_is_kept(self):
        InventoryMovement.objects.record(self.pads, MovementKind.INITIAL_COUNT, 3, self.owner)

        response = self.delete()

        self.assertEqual((response.status_code, response.json()["code"]), (409, "product_has_history"))
        self.assertEqual(response.json()["message"], "Este producto ya tiene historial: no se puede eliminar, desactívalo.")
        self.pads.refresh_from_db()
        self.assertEqual(list(self.pads.compatible_motos.all()), [self.discover])
        self.assertEqual(self.pads.movements.count(), 1)

    def test_product_with_only_a_price_change_is_kept(self):
        PriceChange.objects.create(
            product=self.pads, old_price=15000, new_price=16000, reason="Alza", changed_by=self.owner,
        )

        self.assertEqual(self.delete().status_code, 409)
        self.assertTrue(Product.objects.filter(pk=self.pads.pk).exists())

    def test_seller_cannot_delete(self):
        login_client(self.client, self.seller)

        self.assertEqual(self.delete().status_code, 403)
        self.assertTrue(Product.objects.filter(pk=self.pads.pk).exists())

    def test_unknown_product_is_404(self):
        self.assertEqual(self.delete(9999).status_code, 404)

    def test_rest_of_catalog_still_cannot_be_deleted(self):
        self.assertEqual(self.client.delete(f"/api/v1/catalog/categories/{self.brakes.pk}").status_code, 405)


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class DuplicateProductTests(CatalogApiMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.bajaj = Brand.objects.create(name="Bajaj")
        self.pads = self.product("FRE-PUL-PAS", "Pastillas de freno", moto=self.pulsar, brand=self.bajaj)

    def data(self, **extra):
        data = {
            "name": "Pastillas de freno", "category": self.brakes.pk, "brand": self.bajaj.pk, "moto": self.pulsar.pk,
            "cost_price": 10000, "sale_price": 15000,
        }
        data.update(extra)
        return data

    def create(self, **extra):
        return self.client.post(PRODUCTS, self.data(**extra), content_type=JSON)

    def edit(self, product, **data):
        return self.client.patch(f"{PRODUCTS}/{product.pk}", data, content_type=JSON)

    def test_second_creation_is_rejected_instead_of_getting_a_numbered_code(self):
        response = self.create()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["name"], ["Este producto ya existe con la misma marca y moto: FRE-PUL-PAS."])
        self.assertEqual(Product.objects.count(), 1)

    def test_capitals_accents_spaces_and_another_code_do_not_get_around_it(self):
        for name in ("PASTILLAS DE FRENO", "  Pastillas   de  freno ", "Pástillas de freno"):
            with self.subTest(name):
                self.assertEqual(self.create(name=name).status_code, 400)
        self.assertEqual(self.create(code="OTRO-1").status_code, 400)

    def test_same_name_with_other_brand_or_moto_is_a_different_product(self):
        other_brand = Brand.objects.create(name="Vaisand")

        self.assertEqual(self.create(brand=other_brand.pk).status_code, 201)
        self.assertEqual(self.create(brand=None).status_code, 201)
        self.assertEqual(self.create(moto=self.discover.pk).status_code, 201)
        self.assertEqual(self.create(moto=None).status_code, 201)

    def test_universal_without_brand_is_also_detected(self):
        self.product("ELE-UNI-BUJ", "Bujía", category=self.electric)

        self.assertEqual(self.create(name="bujia", brand=None, moto=None).status_code, 400)

    def test_deactivated_twin_says_to_reactivate_it(self):
        Product.objects.filter(pk=self.pads.pk).update(is_active=False)

        response = self.create()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["fields"]["name"],
            ["Este producto ya existe desactivado: FRE-PUL-PAS. Actívalo en lugar de crearlo otra vez."],
        )

    def test_renaming_onto_another_product_is_rejected(self):
        other = self.product("FRE-PUL-DIS", "Disco", moto=self.pulsar, brand=self.bajaj)

        self.assertEqual(self.edit(other, name="Pastillas de freno").status_code, 400)
        other.refresh_from_db()
        self.assertEqual(other.name, "Disco")

    def test_product_can_be_saved_without_changes(self):
        response = self.edit(self.pads, name="Pastillas de freno", brand=self.bajaj.pk, moto=self.pulsar.pk, sale_price=16000)

        self.assertEqual(response.status_code, 200)

    def test_existing_duplicate_can_still_be_edited_and_deactivated(self):
        twin = self.product("FRE-PUL-PAS2", "Pastillas de freno", moto=self.pulsar, brand=self.bajaj)

        # La pantalla envía el formulario completo, aunque solo cambie el interruptor.
        response = self.edit(twin, name=twin.name, brand=self.bajaj.pk, moto=self.pulsar.pk, is_active=False)

        self.assertEqual(response.status_code, 200)
        twin.refresh_from_db()
        self.assertFalse(twin.is_active)

    def test_existing_duplicate_can_be_renamed_to_fix_it(self):
        twin = self.product("FRE-PUL-PAS2", "Pastillas de freno", moto=self.pulsar, brand=self.bajaj)

        self.assertEqual(self.edit(twin, name="Pastillas de freno traseras").status_code, 200)

    def test_reactivating_is_rejected_only_if_the_twin_is_active(self):
        twin = self.product("FRE-PUL-PAS2", "Pastillas de freno", moto=self.pulsar, brand=self.bajaj, is_active=False)

        self.assertEqual(self.edit(twin, is_active=True).status_code, 400)

        Product.objects.filter(pk=self.pads.pk).update(is_active=False)
        self.assertEqual(self.edit(twin, is_active=True).status_code, 200)

    def test_initial_count_is_also_covered(self):
        response = self.client.post(
            "/api/v1/inventory/initial-count/items", self.data(quantity=2), content_type=JSON,
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json()["fields"])
        self.assertEqual(Product.objects.count(), 1)
