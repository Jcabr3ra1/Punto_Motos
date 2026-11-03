import uuid

from django.test import TestCase, override_settings

from apps.accounts.models import Role
from apps.cash.models import CashSession
from apps.inventory.models import InventoryMovement, MovementKind
from apps.sales.models import Customer

from .helpers import APP_TOKEN, login_client, make_user, open_cash
from .test_catalog_models import make_product
from .test_sales_models import finish_initial_count, stock_of

JSON = "application/json"


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class CashApiTestCase(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)
        self.product = make_product(cost_price=18000, sale_price=25000)
        InventoryMovement.objects.record(self.product, MovementKind.INITIAL_COUNT, 5, self.owner)
        finish_initial_count(self.owner)
        self.customer = Customer.objects.create(name="Juan Pérez")

    def post(self, url, data=None):
        return self.client.post(url, data or {}, content_type=JSON)

    def sell(self, payments=None):
        return self.post("/api/v1/sales", {
            "idempotency_key": str(uuid.uuid4()), "customer": self.customer.pk,
            "items": [{"product": self.product.pk, "quantity": 1}],
            "payments": payments or [{"method": "cash", "amount": 25000}],
        })


class PermissionTests(CashApiTestCase):
    def test_seller_only_sees_if_cash_is_open(self):
        session = open_cash(self.owner, opening_cash=50000)
        login_client(self.client, self.seller)

        self.assertEqual(self.client.get("/api/v1/cash-sessions/current").json(), {"is_open": True})
        for method, url in [
            ("get", "/api/v1/cash-sessions"),
            ("post", "/api/v1/cash-sessions"),
            ("get", f"/api/v1/cash-sessions/{session.pk}"),
            ("post", f"/api/v1/cash-sessions/{session.pk}/close"),
            ("get", "/api/v1/cash-movements"),
            ("post", "/api/v1/cash-movements"),
        ]:
            with self.subTest(method=method, url=url):
                self.assertEqual(getattr(self.client, method)(url, content_type=JSON).status_code, 403)

    def test_current_needs_session(self):
        login_client(self.client)

        self.assertEqual(self.client.get("/api/v1/cash-sessions/current").status_code, 401)


class CashFlowTests(CashApiTestCase):
    def test_open_sell_spend_and_close(self):
        current = self.client.get("/api/v1/cash-sessions/current").json()
        self.assertEqual(current, {"is_open": False, "session": None, "suggested_opening_cash": 0})
        self.assertEqual(self.sell().json()["code"], "cash_session_closed")

        session = self.post("/api/v1/cash-sessions", {"opening_cash": 50000})
        self.assertEqual(session.status_code, 201)
        session_id = session.json()["id"]
        self.assertEqual(self.post("/api/v1/cash-sessions", {"opening_cash": 0}).status_code, 400)

        self.sell(payments=[{"method": "cash", "amount": 10000}, {"method": "transfer", "amount": 15000}])
        spent = self.post("/api/v1/cash-movements", {
            "kind": "expense", "amount": 3000, "method": "cash", "reason": "Almuerzo",
        })
        self.assertEqual((spent.status_code, spent.json()["amount"]), (201, -3000))

        current = self.client.get("/api/v1/cash-sessions/current").json()["session"]
        self.assertEqual(current["expected_cash"], 57000)
        self.assertEqual(current["summary"]["transfer_total"], 15000)
        self.assertEqual(
            [(row["kind"], row["cash"], row["transfer"]) for row in current["summary"]["by_kind"]],
            [("sale", 10000, 15000), ("expense", -3000, 0)],
        )

        response = self.post(f"/api/v1/cash-sessions/{session_id}/close", {"counted_cash": 56000})
        self.assertEqual(response.json()["fields"]["notes"], ["Faltan $1.000 frente a lo esperado: explica la diferencia."])
        response = self.post(f"/api/v1/cash-sessions/{session_id}/close", {"counted_cash": 56000, "notes": "Vuelto"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()["is_open"], response.json()["difference"]), (False, -1000))
        self.assertEqual(self.post(f"/api/v1/cash-sessions/{session_id}/close", {"counted_cash": 1}).status_code, 409)

        current = self.client.get("/api/v1/cash-sessions/current").json()
        self.assertEqual(current["suggested_opening_cash"], 56000)

    def test_movements_filter_by_session_and_kind(self):
        session = open_cash(self.owner)
        self.sell()

        response = self.client.get("/api/v1/cash-movements", {"session": session.pk, "kind": "sale"})

        movement = response.json()["results"][0]
        self.assertEqual((movement["sale_number"], movement["kind_label"]), (1, "Venta"))

    def test_only_expenses_and_withdrawals_by_hand(self):
        open_cash(self.owner)

        response = self.post("/api/v1/cash-movements", {"kind": "sale", "amount": 1000, "method": "cash", "reason": "x"})

        self.assertEqual(response.status_code, 400)
        self.assertIn("kind", response.json()["fields"])


class VoidSaleApiTests(CashApiTestCase):
    def setUp(self):
        super().setUp()
        self.session = open_cash(self.owner, opening_cash=50000)
        self.sale_id = self.sell().json()["id"]

    def test_owner_voids(self):
        response = self.post(f"/api/v1/sales/{self.sale_id}/void", {"reason": "Cliente equivocado"})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual((data["is_voided"], data["voided_by"], data["void_reason"]), (True, "dueno", "Cliente equivocado"))
        self.assertEqual(stock_of(self.product), 5)
        self.assertEqual(CashSession.objects.current().current_expected_cash, 50000)
        self.assertEqual(self.post(f"/api/v1/sales/{self.sale_id}/void", {"reason": "Otra"}).json()["code"], "sale_voided")

        listed = self.client.get("/api/v1/sales", {"voided": "true"}).json()["results"]
        self.assertEqual([sale["id"] for sale in listed], [self.sale_id])
        self.assertEqual(self.client.get("/api/v1/sales", {"voided": "false"}).json()["count"], 0)

    def test_seller_cannot_void(self):
        login_client(self.client, self.seller)

        self.assertEqual(self.post(f"/api/v1/sales/{self.sale_id}/void", {"reason": "x"}).status_code, 403)

    def test_needs_reason(self):
        response = self.post(f"/api/v1/sales/{self.sale_id}/void", {"reason": "  "})

        self.assertEqual(response.status_code, 400)
        self.assertIn("reason", response.json()["fields"])

    def test_needs_open_cash(self):
        self.session.close(75000, self.owner)

        response = self.post(f"/api/v1/sales/{self.sale_id}/void", {"reason": "Error"})

        self.assertEqual((response.status_code, response.json()["code"]), (409, "cash_session_closed"))
