import uuid

from django.test import TestCase, override_settings

from apps.accounts.models import Role
from apps.inventory.models import InitialCount, InventoryMovement, MovementKind
from apps.sales.models import Customer, Sale

from .helpers import APP_TOKEN, login_client, make_user, open_cash
from .test_catalog_models import make_product
from .test_sales_models import finish_initial_count, stock_of

JSON = "application/json"


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SalesApiTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.seller = make_user("ana")
        login_client(self.client, self.seller)
        self.product = make_product(cost_price=18000, sale_price=25000)
        InventoryMovement.objects.record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        finish_initial_count(self.owner)
        self.customer = Customer.objects.create(name="Juan Pérez", phone="3001234567")

    def sale_data(self, quantity=2, **extra):
        data = {
            "idempotency_key": str(uuid.uuid4()),
            "customer": self.customer.pk,
            "items": [{"product": self.product.pk, "quantity": quantity}],
            "payments": [{"method": "cash", "amount": 25000 * quantity}],
        }
        data.update(extra)
        return data

    def post(self, url, data):
        return self.client.post(url, data, content_type=JSON)


class CustomerApiTests(SalesApiTestCase):
    def test_seller_creates_and_searches_customers(self):
        response = self.post("/api/v1/customers", {"name": "José Muñoz"})
        self.assertEqual(response.status_code, 201)

        response = self.client.get("/api/v1/customers", {"q": "munoz jose"})
        self.assertEqual([c["name"] for c in response.json()["results"]], ["José Muñoz"])

        response = self.client.get("/api/v1/customers", {"q": "300123"})
        self.assertEqual([c["name"] for c in response.json()["results"]], ["Juan Pérez"])

    def test_inactive_are_hidden_by_default(self):
        Customer.objects.create(name="Juan Viejo", is_active=False)

        response = self.client.get("/api/v1/customers", {"q": "juan"})
        self.assertEqual(response.json()["count"], 1)
        response = self.client.get("/api/v1/customers", {"q": "juan", "include_inactive": "true"})
        self.assertEqual(response.json()["count"], 2)

    def test_cannot_delete(self):
        response = self.client.delete(f"/api/v1/customers/{self.customer.pk}")

        self.assertEqual(response.status_code, 405)


class SaleApiTests(SalesApiTestCase):
    def test_seller_sells_and_retry_returns_200(self):
        data = self.sale_data()

        first = self.post("/api/v1/sales", data)
        again = self.post("/api/v1/sales", data)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["id"], first.json()["id"])
        self.assertEqual(first.json()["number"], 1)
        self.assertNotIn("unit_cost", first.json()["items"][0])
        self.assertEqual(stock_of(self.product), 3)

    def test_validation_error_format(self):
        response = self.post("/api/v1/sales", self.sale_data(quantity=6))

        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "validation_error")
        self.assertEqual(body["fields"]["items"][0]["quantity"], ["Solo hay 5 unidades de FRE-PUL-PAS."])

    def test_initial_count_open_is_409(self):
        InitialCount.objects.filter(pk=InitialCount.SINGLETON_PK).update(finished_at=None, finished_by=None)

        response = self.post("/api/v1/sales", self.sale_data())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "initial_count_open")

    def test_list_filters_and_detail(self):
        self.post("/api/v1/sales", self.sale_data(quantity=1))
        other = Customer.objects.create(name="Ana Gómez")
        self.post("/api/v1/sales", self.sale_data(quantity=1, customer=other.pk))

        response = self.client.get("/api/v1/sales")
        self.assertEqual([s["number"] for s in response.json()["results"]], [2, 1])
        response = self.client.get("/api/v1/sales", {"customer": other.pk})
        self.assertEqual([s["number"] for s in response.json()["results"]], [2])
        response = self.client.get("/api/v1/sales", {"number": 1})
        sale = response.json()["results"][0]
        self.assertEqual((sale["customer"]["name"], sale["items_count"]), ("Juan Pérez", 1))

        detail = self.client.get(f"/api/v1/sales/{sale['id']}").json()
        self.assertEqual(detail["payments"], [{"method": "cash", "method_label": "Efectivo", "amount": 25000}])

    def test_owner_sees_cost_in_detail(self):
        sale = Sale.objects.confirm(
            self.customer, [{"product": self.product, "quantity": 1}], [{"method": "cash", "amount": 25000}],
            self.seller, uuid.uuid4(),
        )[0]
        login_client(self.client, self.owner)

        detail = self.client.get(f"/api/v1/sales/{sale.pk}").json()

        self.assertEqual(detail["items"][0]["unit_cost"], 18000)

    def test_sales_cannot_be_edited_or_deleted(self):
        sale_id = self.post("/api/v1/sales", self.sale_data()).json()["id"]

        self.assertEqual(self.client.patch(f"/api/v1/sales/{sale_id}", {}, content_type=JSON).status_code, 405)
        self.assertEqual(self.client.delete(f"/api/v1/sales/{sale_id}").status_code, 405)

    def test_bad_filter_is_400(self):
        response = self.client.get("/api/v1/sales", {"date_from": "ayer"})

        self.assertEqual(response.status_code, 400)

    def test_without_session_is_401(self):
        login_client(self.client)

        self.assertEqual(self.client.get("/api/v1/sales").status_code, 401)
