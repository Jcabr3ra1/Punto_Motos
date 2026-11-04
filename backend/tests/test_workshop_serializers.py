from django.test import TestCase
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Role
from apps.core.models import BusinessSettings
from apps.core.serializers import BusinessSettingsSerializer
from apps.inventory.models import InventoryMovement, MovementKind
from apps.inventory.serializers import WorkshopUseSerializer
from apps.sales.models import Sale
from apps.workshop.models import Mechanic
from apps.workshop.serializers import MechanicSerializer, ServiceTypeSerializer

from .helpers import make_user
from .test_catalog_models import make_product
from .test_catalog_serializers import context_for
from .test_sales_models import stock_of
from .test_sales_serializers import SaleSerializerTestCase
from .test_workshop_models import make_service_type


class ServiceTypeSerializerTests(TestCase):
    def test_creates_with_clean_name(self):
        serializer = ServiceTypeSerializer(data={"code": 101, "name": "  Cambio  de aceite ", "suggested_price": 15000})
        serializer.is_valid(raise_exception=True)
        service_type = serializer.save()

        self.assertEqual(service_type.name, "Cambio de aceite")
        self.assertFalse(service_type.needs_description)

    def test_repeated_code_or_name_is_rejected(self):
        oil = make_service_type()

        serializer = ServiceTypeSerializer(data={"code": 101, "name": "Frenos", "suggested_price": 20000})
        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["code"], ["Ya existe un tipo de servicio con ese código."])
        serializer = ServiceTypeSerializer(data={"code": 102, "name": "CAMBIO DE ACEITE", "suggested_price": 1})
        self.assertFalse(serializer.is_valid())
        self.assertIn("name", serializer.errors)
        # Editarlo con su mismo código no choca consigo mismo.
        serializer = ServiceTypeSerializer(oil, data={"suggested_price": 18000}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_code_must_be_positive(self):
        serializer = ServiceTypeSerializer(data={"code": 0, "name": "Frenos", "suggested_price": 1})
        self.assertFalse(serializer.is_valid())
        self.assertIn("code", serializer.errors)


class MechanicSerializerTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("vendedor")

    def test_owner_sees_percentages_and_seller_only_the_name(self):
        mechanic = Mechanic.objects.create(name="Carlos Ruiz")

        data = MechanicSerializer(mechanic, context=context_for(self.owner)).data
        self.assertEqual((data["labor_percentage"], data["effective_percentage"]), (None, 60))
        data = MechanicSerializer(mechanic, context=context_for(self.seller)).data
        self.assertNotIn("labor_percentage", data)
        self.assertNotIn("effective_percentage", data)

    def test_percentage_between_0_and_100_or_null(self):
        serializer = MechanicSerializer(data={"name": "Carlos Ruiz", "labor_percentage": 101})
        self.assertFalse(serializer.is_valid())
        self.assertIn("labor_percentage", serializer.errors)

        serializer = MechanicSerializer(data={"name": "Carlos Ruiz", "labor_percentage": 70})
        serializer.is_valid(raise_exception=True)
        mechanic = serializer.save()
        serializer = MechanicSerializer(mechanic, data={"labor_percentage": None}, partial=True)
        serializer.is_valid(raise_exception=True)
        self.assertIsNone(serializer.save().labor_percentage)

    def test_repeated_name_is_rejected(self):
        Mechanic.objects.create(name="Carlos Ruiz")

        serializer = MechanicSerializer(data={"name": "carlos ruiz"})
        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["name"], ["Ya existe un mecánico con ese nombre."])


class BusinessSettingsPercentageTests(TestCase):
    def test_general_percentage_is_editable_and_limited(self):
        settings = BusinessSettings.load()

        serializer = BusinessSettingsSerializer(settings, data={"default_mechanic_percentage": 101}, partial=True)
        self.assertFalse(serializer.is_valid())
        serializer = BusinessSettingsSerializer(settings, data={"default_mechanic_percentage": 55}, partial=True)
        serializer.is_valid(raise_exception=True)
        self.assertEqual(serializer.save().default_mechanic_percentage, 55)


class SaleWithServicesSerializerTests(SaleSerializerTestCase):
    def setUp(self):
        super().setUp()
        self.oil = make_service_type()
        self.other = make_service_type(code=999, name="Otro", suggested_price=0, needs_description=True)
        self.carlos = Mechanic.objects.create(name="Carlos Ruiz")

    def service(self, **extra):
        data = {"service_type": self.oil.pk, "mechanic": self.carlos.pk}
        data.update(extra)
        return data

    def test_confirms_services_with_parts_and_returns_them(self):
        serializer = self.confirm(self.data(
            items=[{"product": self.brakes.pk, "quantity": 1}],
            services=[self.service(plate="abc 12d")],
            payments=[{"method": "cash", "amount": 40000}],
        ))

        data = serializer.data
        self.assertEqual((data["total"], data["items_count"], data["services_count"]), (40000, 1, 1))
        service = data["services"][0]
        self.assertEqual(service["service_type"], {"id": self.oil.pk, "code": 101, "name": "Cambio de aceite"})
        self.assertEqual(service["mechanic"], {"id": self.carlos.pk, "name": "Carlos Ruiz"})
        self.assertEqual((service["plate"], service["labor_price"], service["price_changed"]), ("ABC12D", 15000, False))
        self.assertEqual(stock_of(self.brakes), 4)

    def test_sale_can_have_only_services(self):
        serializer = self.confirm(self.data(items=[], services=[self.service()], payments=[{"method": "cash", "amount": 15000}]))

        self.assertEqual(serializer.data["items"], [])
        self.assertEqual(serializer.data["total"], 15000)

    def test_sale_without_items_key_is_accepted_with_services(self):
        data = self.data(services=[self.service()], payments=[{"method": "cash", "amount": 15000}])
        del data["items"]

        self.assertEqual(self.confirm(data).data["total"], 15000)

    def test_empty_sale_is_rejected(self):
        errors = self.errors(self.data(items=[], services=[], payments=[]))

        self.assertEqual(errors["items"], ["Agrega al menos un producto o un servicio."])

    def test_payment_must_include_services(self):
        errors = self.errors(self.data(
            items=[{"product": self.brakes.pk, "quantity": 2}], services=[self.service()],
        ))

        self.assertIn("$65.000", errors["payments"][0])

    def test_seller_cannot_change_labor_price_and_owner_can(self):
        data = self.data(items=[], services=[self.service(labor_price=20000)], payments=[{"method": "cash", "amount": 20000}])

        errors = self.errors(data)
        self.assertEqual(errors["services"][0]["labor_price"], ["Solo el dueño puede cambiar el valor del servicio."])
        self.assertFalse(Sale.objects.exists())

        service = self.confirm(data, user=self.owner).data["services"][0]
        self.assertEqual((service["suggested_price"], service["labor_price"], service["price_changed"]), (15000, 20000, True))

    def test_other_needs_details_on_its_line(self):
        errors = self.errors(self.data(
            items=[], services=[self.service(), self.service(service_type=self.other.pk, labor_price=0)],
            payments=[{"method": "cash", "amount": 15000}],
        ), user=self.owner)

        self.assertEqual(errors["services"][0], {})
        self.assertIn("Otro", errors["services"][1]["details"][0])

    def test_inactive_mechanic_is_rejected(self):
        self.carlos.is_active = False
        self.carlos.save()

        errors = self.errors(self.data(items=[], services=[self.service()], payments=[{"method": "cash", "amount": 15000}]))
        self.assertIn("mechanic", errors["services"][0])

    def test_plate_too_long_is_rejected(self):
        errors = self.errors(self.data(
            items=[], services=[self.service(plate="ABC-123-DEF-45")], payments=[{"method": "cash", "amount": 15000}],
        ))

        self.assertEqual(errors["services"][0]["plate"], ["La placa tiene máximo 10 caracteres."])


class WorkshopUseSerializerTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.grease = make_product(code="LUB-UNI-GRA", name="Grasa multiuso", is_workshop_supply=True)
        self.brakes = make_product()
        InventoryMovement.objects.record(self.grease, MovementKind.INITIAL_COUNT, 2, self.owner)

    def save(self, data):
        serializer = WorkshopUseSerializer(data=data, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)
        return serializer.save(), serializer.data

    def test_records_workshop_use(self):
        _, data = self.save({"product": self.grease.pk, "quantity": 1, "reason": " Envase  abierto "})

        self.assertEqual((data["kind"], data["kind_label"], data["quantity"]), ("workshop_use", "Consumo del taller", -1))
        self.assertEqual(data["reason"], "Envase abierto")
        self.assertEqual(stock_of(self.grease), 1)

    def test_rejects_product_that_is_not_workshop_supply(self):
        serializer = WorkshopUseSerializer(data={"product": self.brakes.pk, "quantity": 1}, context=context_for(self.owner))

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["product"], ["Este producto no está marcado como insumo de taller."])

    def test_not_enough_stock_points_to_quantity(self):
        serializer = WorkshopUseSerializer(data={"product": self.grease.pk, "quantity": 3}, context=context_for(self.owner))
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(ValidationError) as raised:
            serializer.save()
        self.assertEqual(raised.exception.detail["quantity"], ["Solo hay 2 unidades de LUB-UNI-GRA."])
