from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from apps.catalog.models import Brand, Category, MotoModel, Product, normalize_code
from apps.catalog.text import plain_text


def make_product(code="FRE-PUL-PAS", **extra):
    defaults = {
        "name": "Pastillas de freno Pulsar 180",
        "category": Category.objects.get_or_create(name="Frenos", abbreviation="FRE")[0],
        "cost_price": 18000,
        "sale_price": 25000,
    }
    defaults.update(extra)
    return Product.objects.create(code=code, **defaults)


class PlainTextTests(TestCase):
    def test_removes_accents_case_and_extra_spaces(self):
        self.assertEqual(plain_text("  Bujía   NGK "), "bujia ngk")
        self.assertEqual(plain_text("PIÑÓN"), "pinon")

    def test_search_fields_are_filled_on_save(self):
        product = make_product(name="Líquido de frenos DOT 4")
        brand = Brand.objects.create(name="Motul Ñ")

        self.assertEqual(product.search_text, "liquido de frenos dot 4")
        self.assertEqual(brand.search_name, "motul n")


class NormalizeCodeTests(TestCase):
    def test_ignores_dashes_spaces_and_case(self):
        for value in ["FRE-PUL-PAS", "fre-pul-pas", "FREPULPAS", " fre pul pas "]:
            with self.subTest(value=value):
                self.assertEqual(normalize_code(value), "FREPULPAS")


class ProductModelTests(TestCase):
    def test_code_is_saved_uppercase_with_normalized_copy(self):
        product = make_product(code=" fre-pul-pas ")

        self.assertEqual(product.code, "FRE-PUL-PAS")
        self.assertEqual(product.code_normalized, "FREPULPAS")

    def test_same_code_with_or_without_dashes_is_rejected(self):
        make_product(code="FRE-PUL-PAS")

        with self.assertRaises(IntegrityError), transaction.atomic():
            make_product(code="FREPULPAS")

    def test_code_rejects_symbols(self):
        product = Product(
            code="FRE/PUL", name="X", category=Category.objects.create(name="Frenos", abbreviation="FRE"),
            cost_price=1, sale_price=1,
        )

        with self.assertRaises(ValidationError) as ctx:
            product.full_clean()
        self.assertIn("code", ctx.exception.message_dict)

    def test_product_without_moto_is_universal(self):
        self.assertTrue(make_product(code="ELE-UNI-BUJ").is_universal)

    def test_compatible_motos(self):
        pulsar = MotoModel.objects.create(name="Pulsar 180", abbreviation="PUL")
        discover = MotoModel.objects.create(name="Discover 125", abbreviation="DIS")
        product = make_product(moto=pulsar)

        product.compatible_motos.add(discover)

        self.assertEqual(list(discover.compatible_products.all()), [product])
        self.assertEqual(list(pulsar.main_products.all()), [product])

    def test_warns_when_selling_below_cost(self):
        self.assertTrue(make_product(cost_price=30000, sale_price=25000).sells_below_cost)
        self.assertFalse(make_product(code="FRE-PUL-PAS2").sells_below_cost)

    def test_category_in_use_cannot_be_deleted(self):
        product = make_product()

        with self.assertRaises(IntegrityError), transaction.atomic():
            product.category.delete()

    def test_name_spaces_are_cleaned(self):
        self.assertEqual(make_product(name="  Pastillas   de freno ").name, "Pastillas de freno")


class NamedModelTests(TestCase):
    def test_brand_name_is_unique_ignoring_case(self):
        Brand.objects.create(name="Bajaj")

        with self.assertRaises(IntegrityError), transaction.atomic():
            Brand.objects.create(name="BAJAJ")

    def test_category_abbreviation_is_uppercase_and_unique(self):
        category = Category.objects.create(name="Frenos", abbreviation="fre")
        self.assertEqual(category.abbreviation, "FRE")

        with self.assertRaises(IntegrityError), transaction.atomic():
            Category.objects.create(name="Frenos traseros", abbreviation="FRE")

    def test_moto_abbreviation_can_repeat_between_versions(self):
        MotoModel.objects.create(name="Pulsar 180", abbreviation="PUL")
        MotoModel.objects.create(name="Pulsar 200", abbreviation="PUL")

        self.assertEqual(MotoModel.objects.filter(abbreviation="PUL").count(), 2)

    def test_uni_is_reserved_for_universal_parts(self):
        moto = MotoModel(name="Universal", abbreviation="UNI")

        with self.assertRaises(ValidationError) as ctx:
            moto.full_clean()
        self.assertIn("abbreviation", ctx.exception.message_dict)
