import uuid

from django.test import TestCase, override_settings

from apps.accounts.models import Role
from apps.inventory.models import InventoryMovement, MovementKind
from apps.workshop.models import Mechanic, ServiceType

from .helpers import APP_TOKEN, login_client, make_user
from .test_catalog_models import make_product
from .test_sales_models import stock_of
from .test_sales_views import JSON, SalesApiTestCase
from .test_workshop_models import make_service_type


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class WorkshopApiTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)

    def post(self, url, data):
        return self.client.post(url, data, content_type=JSON)

    def patch(self, url, data):
        return self.client.patch(url, data, content_type=JSON)


class ServiceTypeApiTests(WorkshopApiTestCase):
    def test_owner_creates_and_edits_and_everyone_lists_by_code(self):
        response = self.post("/api/v1/service-types", {"code": 200, "name": "Frenos", "suggested_price": 20000})
        self.assertEqual(response.status_code, 201)
        self.post("/api/v1/service-types", {"code": 101, "name": "Cambio de aceite", "suggested_price": 15000})
        response = self.patch(f"/api/v1/service-types/{response.json()['id']}", {"suggested_price": 22000})
        self.assertEqual(response.json()["suggested_price"], 22000)

        login_client(self.client, self.seller)
        data = self.client.get("/api/v1/service-types").json()
        self.assertEqual([t["code"] for t in data], [101, 200])
        self.assertEqual(
            set(data[0]), {"id", "code", "name", "suggested_price", "is_active"},
        )

    def test_seller_cannot_create_or_edit(self):
        oil = make_service_type()
        login_client(self.client, self.seller)

        self.assertEqual(self.post("/api/v1/service-types", {"code": 1, "name": "X", "suggested_price": 1}).status_code, 403)
        self.assertEqual(self.patch(f"/api/v1/service-types/{oil.pk}", {"suggested_price": 1}).status_code, 403)

    def test_inactive_hidden_unless_asked_and_no_delete(self):
        oil = make_service_type()
        make_service_type(code=102, name="Viejo", is_active=False)

        self.assertEqual(len(self.client.get("/api/v1/service-types").json()), 1)
        self.assertEqual(len(self.client.get("/api/v1/service-types", {"include_inactive": "true"}).json()), 2)
        self.assertEqual(self.client.delete(f"/api/v1/service-types/{oil.pk}").status_code, 405)
        self.assertTrue(ServiceType.objects.filter(pk=oil.pk).exists())


class MechanicApiTests(WorkshopApiTestCase):
    def test_owner_manages_mechanics_with_percentage(self):
        response = self.post("/api/v1/mechanics", {"name": "Carlos Ruiz", "phone": "3001112233", "labor_percentage": 70})

        self.assertEqual(response.status_code, 201)
        self.assertEqual((response.json()["labor_percentage"], response.json()["effective_percentage"]), (70, 70))
        response = self.patch(f"/api/v1/mechanics/{response.json()['id']}", {"labor_percentage": None})
        self.assertEqual((response.json()["labor_percentage"], response.json()["effective_percentage"]), (None, 60))

    def test_seller_lists_names_without_percentages_and_cannot_edit(self):
        carlos = Mechanic.objects.create(name="Carlos Ruiz", labor_percentage=70)
        login_client(self.client, self.seller)

        data = self.client.get("/api/v1/mechanics").json()
        self.assertEqual(data, [{"id": carlos.pk, "name": "Carlos Ruiz", "phone": "", "is_active": True}])
        self.assertEqual(self.patch(f"/api/v1/mechanics/{carlos.pk}", {"labor_percentage": 90}).status_code, 403)
        self.assertEqual(self.post("/api/v1/mechanics", {"name": "Pedro"}).status_code, 403)

    def test_general_percentage_lives_in_business_settings(self):
        response = self.patch("/api/v1/settings/business", {"default_mechanic_percentage": 55})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["default_mechanic_percentage"], 55)
        carlos = Mechanic.objects.create(name="Carlos Ruiz")
        self.assertEqual(self.client.get(f"/api/v1/mechanics/{carlos.pk}").json()["effective_percentage"], 55)


class SaleWithServicesApiTests(SalesApiTestCase):
    def setUp(self):
        super().setUp()
        self.oil = make_service_type()
        self.carlos = Mechanic.objects.create(name="Carlos Ruiz")
        self.pedro = Mechanic.objects.create(name="Pedro Gómez")

    def service_sale(self, mechanic, **extra):
        data = self.sale_data(
            quantity=1, services=[{"service_type": self.oil.pk, "mechanic": mechanic.pk, "plate": "abc12d"}],
            payments=[{"method": "cash", "amount": 40000}],
        )
        data.update(extra)
        return data

    def test_seller_sells_service_with_part(self):
        response = self.post("/api/v1/sales", self.service_sale(self.carlos))

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["total"], 40000)
        self.assertEqual(data["services"][0]["mechanic"]["name"], "Carlos Ruiz")
        self.assertEqual(data["services"][0]["plate"], "ABC12D")
        self.assertEqual(stock_of(self.product), 4)

        detail = self.client.get(f"/api/v1/sales/{data['id']}").json()
        self.assertEqual(detail["services"], data["services"])

    def test_retry_does_not_duplicate_services(self):
        data = self.service_sale(self.carlos)
        self.post("/api/v1/sales", data)

        response = self.post("/api/v1/sales", data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["services"]), 1)

    def test_seller_changing_labor_price_gets_400_on_the_line(self):
        data = self.service_sale(self.carlos, payments=[{"method": "cash", "amount": 45000}])
        data["services"][0]["labor_price"] = 20000

        response = self.post("/api/v1/sales", data)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["fields"]["services"][0]["labor_price"],
            ["Solo el dueño puede cambiar el valor del servicio."],
        )

    def test_list_counts_services_and_filters_by_mechanic(self):
        self.post("/api/v1/sales", self.service_sale(self.carlos))
        self.post("/api/v1/sales", self.service_sale(self.pedro))
        self.post("/api/v1/sales", self.sale_data(quantity=1))

        data = self.client.get("/api/v1/sales").json()
        self.assertEqual([s["services_count"] for s in data["results"]], [0, 1, 1])
        data = self.client.get("/api/v1/sales", {"mechanic": self.carlos.pk}).json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(self.client.get("/api/v1/sales", {"mechanic": "x"}).status_code, 400)


class WorkshopUseApiTests(WorkshopApiTestCase):
    def setUp(self):
        super().setUp()
        self.grease = make_product(code="LUB-UNI-GRA", name="Grasa multiuso", is_workshop_supply=True)
        InventoryMovement.objects.record(self.grease, MovementKind.INITIAL_COUNT, 2, self.owner)

    def test_owner_records_use_and_it_shows_in_kardex(self):
        response = self.post("/api/v1/inventory/workshop-use", {"product": self.grease.pk, "quantity": 1})

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["kind"], "workshop_use")
        self.assertEqual(stock_of(self.grease), 1)
        data = self.client.get("/api/v1/inventory/movements", {"kind": "workshop_use"}).json()
        self.assertEqual(data["count"], 1)

    def test_seller_cannot_record_use(self):
        login_client(self.client, self.seller)

        response = self.post("/api/v1/inventory/workshop-use", {"product": self.grease.pk, "quantity": 1})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(stock_of(self.grease), 2)
