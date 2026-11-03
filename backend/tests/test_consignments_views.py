import uuid

from django.test import TestCase, override_settings

from apps.accounts.models import Role
from apps.consignments.models import Consignee
from apps.inventory.models import InventoryMovement, MovementKind

from .helpers import APP_TOKEN, login_client, make_user, open_cash
from .test_catalog_models import make_product
from .test_sales_models import finish_initial_count, stock_of

JSON = "application/json"


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class ConsignmentApiTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        open_cash(self.owner)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)
        self.product = make_product(cost_price=18000, sale_price=25000)
        InventoryMovement.objects.record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        finish_initial_count(self.owner)
        self.shop = Consignee.objects.create(name="Motos El Paisa")

    def post(self, url, data):
        return self.client.post(url, data, content_type=JSON)

    def deliver(self, quantity=3, key=None):
        return self.post("/api/v1/consignment-deliveries", {
            "idempotency_key": key or str(uuid.uuid4()), "consignee": self.shop.pk,
            "items": [{"product": self.product.pk, "quantity": quantity, "unit_value": 19000}],
        })


class PermissionTests(ConsignmentApiTestCase):
    def test_seller_cannot_see_or_touch_consignments(self):
        login_client(self.client, self.seller)

        for method, url in [
            ("get", "/api/v1/consignees"),
            ("post", "/api/v1/consignees"),
            ("get", f"/api/v1/consignees/{self.shop.pk}/pending-items"),
            ("get", "/api/v1/consignment-deliveries"),
            ("post", "/api/v1/consignment-deliveries"),
            ("get", "/api/v1/consignment-reports"),
            ("post", "/api/v1/consignment-reports"),
            ("get", "/api/v1/consignee-payments"),
            ("post", "/api/v1/consignee-payments"),
        ]:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, content_type=JSON)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json()["code"], "permission_denied")


class ConsignmentFlowTests(ConsignmentApiTestCase):
    def test_deliver_report_and_pay(self):
        key = str(uuid.uuid4())
        first = self.deliver(key=key)
        again = self.deliver(key=key)
        self.assertEqual((first.status_code, again.status_code), (201, 200))
        self.assertEqual(stock_of(self.product), 2)

        pending = self.client.get(f"/api/v1/consignees/{self.shop.pk}/pending-items").json()
        self.assertEqual(len(pending), 1)
        self.assertEqual((pending[0]["delivery"], pending[0]["pending_quantity"]), (first.json()["id"], 3))

        response = self.post("/api/v1/consignment-reports", {
            "consignee": self.shop.pk, "lines": [{"item": pending[0]["id"], "sold": 2, "returned": 1}],
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["total"], 38000)
        self.assertEqual(stock_of(self.product), 3)
        self.assertEqual(self.client.get(f"/api/v1/consignees/{self.shop.pk}/pending-items").json(), [])

        response = self.post("/api/v1/consignee-payments", {"consignee": self.shop.pk, "amount": 20000, "method": "cash"})
        self.assertEqual(response.status_code, 201)
        shop = self.client.get(f"/api/v1/consignees/{self.shop.pk}").json()
        self.assertEqual(shop["balance_due"], 18000)

    def test_consignees_with_debt_filter(self):
        Consignee.objects.create(name="Repuestos La 80")
        Consignee.objects.filter(pk=self.shop.pk).update(balance_due=5000)

        response = self.client.get("/api/v1/consignees", {"with_debt": "true"})

        self.assertEqual([c["name"] for c in response.json()], ["Motos El Paisa"])

    def test_balance_cannot_be_written(self):
        response = self.client.patch(
            f"/api/v1/consignees/{self.shop.pk}", {"balance_due": 999, "phone": "300"}, content_type=JSON,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["balance_due"], response.json()["phone"]), (0, "300"))

    def test_lists_filter_by_consignee(self):
        self.deliver()
        other = Consignee.objects.create(name="Repuestos La 80")

        response = self.client.get("/api/v1/consignment-deliveries", {"consignee": other.pk})
        self.assertEqual(response.json()["count"], 0)
        response = self.client.get("/api/v1/consignment-deliveries", {"consignee": self.shop.pk})
        self.assertEqual(response.json()["results"][0]["total_value"], 57000)

    def test_too_many_units_is_400_on_the_line(self):
        response = self.deliver(quantity=6)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["items"][0]["quantity"], ["Solo hay 5 unidades de FRE-PUL-PAS."])
