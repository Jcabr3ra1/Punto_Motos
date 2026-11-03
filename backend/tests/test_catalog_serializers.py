from types import SimpleNamespace

from django.test import TestCase

from apps.accounts.models import Role
from apps.catalog.codes import suggest_code
from apps.catalog.models import Brand, Category, MotoModel, Product
from apps.catalog.serializers import (
    CategorySerializer,
    CodeSuggestionSerializer,
    MotoModelSerializer,
    ProductSerializer,
    ProductWriteSerializer,
)

from .helpers import make_user


def context_for(user):
    return {"request": SimpleNamespace(user=user)}


class CatalogDataMixin:
    def setUp(self):
        self.brakes = Category.objects.create(name="Frenos", abbreviation="FRE")
        self.electric = Category.objects.create(name="Eléctrico", abbreviation="ELE")
        self.tires = Category.objects.create(name="Llantas", abbreviation="LL")
        self.pulsar = MotoModel.objects.create(name="Pulsar 180", abbreviation="PUL")
        self.discover = MotoModel.objects.create(name="Discover 125", abbreviation="DIS")
        self.bajaj = Brand.objects.create(name="Bajaj")


class SuggestCodeTests(CatalogDataMixin, TestCase):
    def test_part_for_a_moto(self):
        self.assertEqual(suggest_code(self.brakes, "Pastillas de freno Pulsar 180", self.pulsar), "FRE-PUL-PAS")

    def test_universal_part(self):
        self.assertEqual(suggest_code(self.electric, "Bujía NGK C7HSA"), "ELE-UNI-BUJ")

    def test_tire_uses_size_and_rim(self):
        self.assertEqual(suggest_code(self.tires, "Llanta 90/90 rin 18"), "LL909018")

    def test_adds_number_when_code_is_taken(self):
        Product.objects.create(code="FRE-PUL-PAS", name="X", category=self.brakes, cost_price=1, sale_price=1)
        Product.objects.create(code="FREPULPAS2", name="Y", category=self.brakes, cost_price=1, sale_price=1)

        self.assertEqual(suggest_code(self.brakes, "Pastillas traseras", self.pulsar), "FRE-PUL-PAS3")

    def test_skips_short_and_common_words(self):
        self.assertEqual(suggest_code(self.brakes, "Kit de arrastre", self.pulsar), "FRE-PUL-KIT")
        self.assertEqual(suggest_code(self.brakes, "De la bomba", self.pulsar), "FRE-PUL-BOM")

    def test_returns_empty_without_enough_data(self):
        self.assertEqual(suggest_code(self.brakes, "  "), "")
        self.assertEqual(suggest_code(self.tires, "Llanta trasera"), "")


class NamedSerializerTests(CatalogDataMixin, TestCase):
    def test_lowercase_abbreviation_is_accepted_and_uppercased(self):
        serializer = CategorySerializer(data={"name": "Aceites", "abbreviation": "ace"})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.save().abbreviation, "ACE")

    def test_duplicate_name_and_abbreviation_have_clear_messages(self):
        serializer = CategorySerializer(data={"name": "FRENOS", "abbreviation": "fre"})

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["name"], ["Ya existe un tipo con ese nombre."])
        self.assertEqual(serializer.errors["abbreviation"], ["Ya existe un tipo con esa sigla."])

    def test_abbreviation_from_2_to_8_letters(self):
        for value, valid in [("ac", True), ("aceitesx", True), ("a", False), ("aceitesxy", False)]:
            with self.subTest(value=value):
                serializer = MotoModelSerializer(data={"name": f"Moto {value}", "abbreviation": value})
                self.assertEqual(serializer.is_valid(), valid, serializer.errors)
                if not valid:
                    self.assertEqual(serializer.errors["abbreviation"], ["La sigla debe tener de 2 a 8 letras."])

    def test_invalid_abbreviation_format(self):
        serializer = CategorySerializer(data={"name": "Aceites", "abbreviation": "a1"})

        self.assertFalse(serializer.is_valid())
        self.assertIn("abbreviation", serializer.errors)

    def test_uni_is_reserved_for_motos(self):
        serializer = MotoModelSerializer(data={"name": "Cualquiera", "abbreviation": "uni"})

        self.assertFalse(serializer.is_valid())
        self.assertIn("abbreviation", serializer.errors)

    def test_renaming_to_its_own_name_is_allowed(self):
        serializer = MotoModelSerializer(self.pulsar, data={"name": "pulsar 180", "abbreviation": "PUL"})

        self.assertTrue(serializer.is_valid(), serializer.errors)


class ProductWriteSerializerTests(CatalogDataMixin, TestCase):
    def payload(self, **extra):
        data = {
            "name": "Pastillas de freno Pulsar 180", "category": self.brakes.pk, "brand": self.bajaj.pk,
            "moto": self.pulsar.pk, "cost_price": 18000, "sale_price": 25000,
        }
        data.update(extra)
        return data

    def test_generates_code_when_left_blank(self):
        serializer = ProductWriteSerializer(data=self.payload(code=""))

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.save().code, "FRE-PUL-PAS")

    def test_keeps_code_written_by_owner(self):
        serializer = ProductWriteSerializer(data=self.payload(code="fre-pul-del"))

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.save().code, "FRE-PUL-DEL")

    def test_rejects_duplicate_code_written_without_dashes(self):
        Product.objects.create(code="FRE-PUL-PAS", name="X", category=self.brakes, cost_price=1, sale_price=1)

        serializer = ProductWriteSerializer(data=self.payload(code="frepulpas"))

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["code"], ["Ya existe un producto con ese código."])

    def test_rejects_code_with_symbols(self):
        serializer = ProductWriteSerializer(data=self.payload(code="FRE/PUL"))

        self.assertFalse(serializer.is_valid())
        self.assertIn("code", serializer.errors)

    def test_sale_price_must_be_positive(self):
        serializer = ProductWriteSerializer(data=self.payload(sale_price=0))

        self.assertFalse(serializer.is_valid())
        self.assertIn("sale_price", serializer.errors)

    def test_selling_below_cost_is_allowed(self):
        serializer = ProductWriteSerializer(data=self.payload(cost_price=30000, sale_price=25000))

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertTrue(serializer.save().sells_below_cost)

    def test_main_moto_is_not_repeated_as_compatible(self):
        serializer = ProductWriteSerializer(data=self.payload(compatible_motos=[self.pulsar.pk, self.discover.pk]))

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(list(serializer.save().compatible_motos.all()), [self.discover])

    def test_inactive_category_cannot_be_used(self):
        self.brakes.is_active = False
        self.brakes.save()

        serializer = ProductWriteSerializer(data=self.payload())

        self.assertFalse(serializer.is_valid())
        self.assertIn("category", serializer.errors)

    def test_editing_without_code_keeps_current_code(self):
        product = ProductWriteSerializer(data=self.payload(code="FRE-PUL-DEL"))
        product.is_valid(raise_exception=True)
        product = product.save()

        serializer = ProductWriteSerializer(product, data={"sale_price": 27000}, partial=True)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.save().code, "FRE-PUL-DEL")


class ProductSerializerTests(CatalogDataMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.product = Product.objects.create(
            code="FRE-PUL-PAS", name="Pastillas", category=self.brakes, moto=self.pulsar,
            cost_price=18000, sale_price=25000,
        )

    def test_owner_sees_cost(self):
        data = ProductSerializer(self.product, context=context_for(make_user("dueno", role=Role.OWNER))).data

        self.assertEqual(data["cost_price"], 18000)
        self.assertFalse(data["sells_below_cost"])
        self.assertEqual(data["category"]["abbreviation"], "FRE")

    def test_seller_does_not_see_cost(self):
        data = ProductSerializer(self.product, context=context_for(make_user("ana"))).data

        self.assertNotIn("cost_price", data)
        self.assertNotIn("sells_below_cost", data)
        self.assertEqual(data["sale_price"], 25000)


class CodeSuggestionSerializerTests(CatalogDataMixin, TestCase):
    def test_suggests_code(self):
        serializer = CodeSuggestionSerializer(
            data={"category": self.brakes.pk, "name": "Pastillas", "moto": self.pulsar.pk}
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.suggestion(), "FRE-PUL-PAS")

    def test_product_being_edited_does_not_collide_with_itself(self):
        product = Product.objects.create(
            code="FRE-PUL-PAS", name="Pastillas", category=self.brakes, cost_price=1, sale_price=1,
        )
        serializer = CodeSuggestionSerializer(
            data={"category": self.brakes.pk, "name": "Pastillas", "moto": self.pulsar.pk, "product": product.pk}
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.suggestion(), "FRE-PUL-PAS")
