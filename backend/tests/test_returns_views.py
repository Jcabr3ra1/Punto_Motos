import uuid
from datetime import timedelta

from apps.cash.models import CashMovementKind, CashSession
from apps.sales.models import SaleReturn

from .helpers import login_client
from .test_sales_models import stock_of
from .test_settlement_views import DAILY, SettlementApiTestCase

RETURNS = "/api/v1/sale-returns"
DEDUCTIONS = "/api/v1/mechanic-deductions"


class ReturnsApiTestCase(SettlementApiTestCase):
    def setUp(self):
        super().setUp()
        self.sale = self.sell_service(self.carlos, with_part=True)    # Repuesto de 25.000 y servicio de 15.000.
        self.item_id = self.sale["items"][0]["id"]
        self.service_id = self.sale["services"][0]["id"]

    def url(self, sale=None):
        return f"/api/v1/sales/{sale or self.sale['id']}/returns"

    def part_data(self, **extra):
        data = {
            "idempotency_key": str(uuid.uuid4()),
            "cause": "other",
            "reason": "Repuesto de otra referencia",
            "items": [{"sale_item": self.item_id, "quantity": 1, "condition": "resellable"}],
            "refunds": [{"method": "cash", "amount": 25000}],
        }
        data.update(extra)
        return data

    def bad_service_data(self, **extra):
        return self.part_data(
            cause="bad_service", reason="Quedó botando aceite", items=[], services=[self.service_id],
            refunds=[{"method": "cash", "amount": 15000}], **extra,
        )


class RegisterReturnApiTests(ReturnsApiTestCase):
    def test_seller_registers_it_and_retry_answers_200(self):
        before = stock_of(self.product)
        data = self.part_data()

        response = self.post(self.url(), data)

        self.assertEqual(response.status_code, 201, response.json())
        self.assertEqual((response.json()["number"], response.json()["total"]), (1, 25000))
        self.assertNotIn("mechanic_deduction", response.json())
        self.assertEqual(stock_of(self.product), before + 1)

        again = self.post(self.url(), data)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()["id"], response.json()["id"])
        self.assertEqual(stock_of(self.product), before + 1)

    def test_sale_shows_what_is_left_to_return(self):
        self.post(self.url(), self.part_data())

        sale = self.client.get(f"/api/v1/sales/{self.sale['id']}").json()

        self.assertEqual(sale["items"][0]["returned_quantity"], 1)
        self.assertFalse(sale["services"][0]["is_returned"])

    def test_errors_arrive_by_field(self):
        response = self.post(self.url(), self.part_data(refunds=[{"method": "cash", "amount": 1}]))
        self.assertEqual(response.status_code, 400)
        self.assertIn("refunds", response.json()["fields"])

        response = self.post(self.url(), self.part_data(
            items=[{"sale_item": self.item_id, "quantity": 2, "condition": "resellable"}],
            refunds=[{"method": "cash", "amount": 50000}],
        ))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["fields"]["items"][0]["quantity"],
            [f"Solo quedan 1 por devolver de {self.sale['items'][0]['description']}."],
        )

    def test_seller_cannot_blame_the_mechanic(self):
        response = self.post(self.url(), self.bad_service_data())

        self.assertEqual(response.status_code, 400)
        self.assertIn("cause", response.json()["fields"])
        self.assertFalse(SaleReturn.objects.exists())

    def test_unknown_sale_is_404(self):
        self.assertEqual(self.post(self.url(9999), self.part_data()).status_code, 404)

    def test_closed_cash_and_voided_sale_are_conflicts(self):
        self.as_owner()
        other = self.post("/api/v1/sales", self.sale_data(quantity=1)).json()
        self.post(f"/api/v1/sales/{other['id']}/void", {"reason": "Error"})

        response = self.post(self.url(other["id"]), self.part_data(
            items=[{"sale_item": other["items"][0]["id"], "quantity": 1, "condition": "resellable"}],
        ))
        self.assertEqual((response.status_code, response.json()["code"]), (409, "sale_voided"))

        session = CashSession.objects.current()
        session.close(session.current_expected_cash, self.owner)
        response = self.post(self.url(), self.part_data())
        self.assertEqual((response.status_code, response.json()["code"]), (409, "cash_session_closed"))

    def test_sale_with_returns_cannot_be_voided(self):
        self.post(self.url(), self.part_data())
        self.as_owner()

        response = self.post(f"/api/v1/sales/{self.sale['id']}/void", {"reason": "Ya no"})

        self.assertEqual((response.status_code, response.json()["code"]), (409, "sale_has_returns"))

    def test_refund_shows_in_cash_movements_with_its_return(self):
        sale_return = self.post(self.url(), self.part_data()).json()
        self.as_owner()

        movements = self.client.get("/api/v1/cash-movements", {"kind": CashMovementKind.SALE_REFUND}).json()["results"]

        self.assertEqual(movements[0]["amount"], -25000)
        self.assertEqual((movements[0]["sale"], movements[0]["sale_return"]), (self.sale["id"], sale_return["id"]))


class BadServiceApiTests(ReturnsApiTestCase):
    def test_settled_sale_can_be_corrected_with_a_return(self):
        self.as_owner()
        self.post(DAILY, {"mechanic": self.carlos.pk})

        response = self.post(self.url(), self.bad_service_data())

        self.assertEqual(response.status_code, 201, response.json())
        deduction = response.json()["mechanic_deduction"]
        self.assertEqual((deduction["mechanic"]["id"], deduction["pending_amount"]), (self.carlos.pk, 15000))

    def test_settlement_sheet_shows_the_deduction_and_can_be_reprinted(self):
        self.as_owner()
        self.post(self.url(), self.bad_service_data())

        preview = self.client.get(DAILY).json()["mechanics"][0]
        self.assertEqual((preview["share"], preview["deductions_total"], preview["amount"]), (9000, 9000, 0))

        sheet = self.post(DAILY, {"mechanic": self.carlos.pk}).json()
        self.assertEqual((sheet["deductions_total"], sheet["amount"]), (9000, 0))
        self.assertEqual(sheet["deductions"][0]["reason"], "Quedó botando aceite")
        self.assertEqual(self.client.get(f"/api/v1/mechanic-settlements/{sheet['id']}").json(), sheet)
        row = self.client.get("/api/v1/mechanic-settlements").json()["results"][0]
        self.assertEqual(row["deductions_total"], 9000)
        self.assertNotIn("deductions", row)


class ReturnHistoryApiTests(ReturnsApiTestCase):
    def test_lists_filters_and_detail_by_role(self):
        first = self.post(self.url(), self.part_data()).json()
        self.as_owner()
        second = self.post(self.url(), self.bad_service_data()).json()

        data = self.client.get(RETURNS).json()
        self.assertEqual([row["id"] for row in data["results"]], [second["id"], first["id"]])
        self.assertNotIn("items", data["results"][0])
        self.assertEqual(self.client.get(RETURNS, {"sale": self.sale["id"]}).json()["count"], 2)
        self.assertEqual(self.client.get(RETURNS, {"sale": 9999}).json()["count"], 0)
        self.assertEqual(self.client.get(RETURNS, {"number": first["number"]}).json()["count"], 1)
        self.assertEqual(self.client.get(RETURNS, {"cause": "bad_service"}).json()["results"][0]["id"], second["id"])
        tomorrow = (self.today + timedelta(days=1)).isoformat()
        self.assertEqual(self.client.get(RETURNS, {"date_from": tomorrow}).json()["count"], 0)
        self.assertEqual(self.client.get(RETURNS, {"date_to": self.today.isoformat()}).json()["count"], 2)
        self.assertEqual(self.client.get(RETURNS, {"sale": "x"}).status_code, 400)

        self.assertEqual(self.client.get(f"{RETURNS}/{second['id']}").json(), second)
        self.assertEqual(self.client.get(f"{RETURNS}/9999").status_code, 404)

    def test_seller_consults_without_the_deduction(self):
        self.as_owner()
        sale_return = self.post(self.url(), self.bad_service_data()).json()
        login_client(self.client, self.seller)

        response = self.client.get(f"{RETURNS}/{sale_return['id']}")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("mechanic_deduction", response.json())
        self.assertEqual(self.client.get(RETURNS).json()["count"], 1)

    def test_returns_are_read_only_at_their_own_route(self):
        sale_return = self.post(self.url(), self.part_data()).json()

        self.assertEqual(self.post(RETURNS, self.part_data()).status_code, 405)
        self.assertEqual(self.client.delete(f"{RETURNS}/{sale_return['id']}").status_code, 405)


class DeductionApiTests(ReturnsApiTestCase):
    def test_owner_sees_pending_balance_even_with_no_services_that_day(self):
        self.as_owner()
        self.post(self.url(), self.bad_service_data())
        self.post(DAILY, {"mechanic": self.carlos.pk})    # Descuenta 9.000 de 15.000 y no le quedan servicios.
        self.assertEqual(self.client.get(DAILY).json()["mechanics"], [])

        data = self.client.get(DEDUCTIONS, {"pending": "true"}).json()

        self.assertEqual(data["count"], 1)
        row = data["results"][0]
        self.assertEqual((row["amount"], row["applied_amount"], row["pending_amount"]), (15000, 9000, 6000))
        self.assertEqual((row["mechanic"]["id"], row["sale_number"]), (self.carlos.pk, self.sale["number"]))
        self.assertEqual(row["services"][0]["service_type"]["id"], self.oil.pk)

    def test_filters(self):
        self.as_owner()
        self.post(self.url(), self.bad_service_data())

        self.assertEqual(self.client.get(DEDUCTIONS, {"mechanic": self.carlos.pk}).json()["count"], 1)
        self.assertEqual(self.client.get(DEDUCTIONS, {"mechanic": self.pedro.pk}).json()["count"], 0)
        self.assertEqual(self.client.get(DEDUCTIONS, {"mechanic": "x"}).status_code, 400)

    def test_paid_off_deduction_leaves_the_pending_list(self):
        self.as_owner()
        self.post(self.url(), self.bad_service_data())
        for _ in range(2):
            self.sell_service(self.carlos)
        self.post(DAILY, {"mechanic": self.carlos.pk})    # Mano de obra 45.000; su parte, 27.000: alcanza.

        self.assertEqual(self.client.get(DEDUCTIONS, {"pending": "true"}).json()["count"], 0)
        self.assertEqual(self.client.get(DEDUCTIONS).json()["results"][0]["pending_amount"], 0)

    def test_seller_cannot_see_them(self):
        self.assertEqual(self.client.get(DEDUCTIONS).status_code, 403)
