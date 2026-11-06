from apps.cash.models import CashMovement, CashMovementKind
from apps.sales.models import ReturnCause, Sale

from .helpers import login_client
from .test_returns_views import DEDUCTIONS, RETURNS, ReturnsApiTestCase
from .test_settlement_views import DAILY

SALES = "/api/v1/sales"


class SaleWithoutCustomerApiTests(ReturnsApiTestCase):
    """Una venta sin cliente debe poder recorrer todo el flujo: nada puede suponer que el cliente existe."""

    def anonymous_sale(self):
        data = self.sale_data(
            quantity=1, customer=None, services=[{"service_type": self.oil.pk, "mechanic": self.carlos.pk}],
            payments=[{"method": "cash", "amount": 40000}],
        )
        response = self.post(SALES, data)
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()

    def test_lists_and_shows_it(self):
        sale = self.anonymous_sale()

        self.assertIsNone(sale["customer"])
        self.assertEqual(str(Sale.objects.get(pk=sale["id"])), f"Venta {sale['number']}")
        self.assertIsNone(self.client.get(f"{SALES}/{sale['id']}").json()["customer"])
        rows = self.client.get(SALES).json()["results"]
        self.assertIsNone(next(row for row in rows if row["id"] == sale["id"])["customer"])

    def test_cash_movement_has_no_customer_in_its_reason(self):
        sale = self.anonymous_sale()

        movement = CashMovement.objects.get(sale_id=sale["id"], kind=CashMovementKind.SALE)
        self.assertEqual(movement.reason, f"Venta {sale['number']}")

    def test_can_be_voided(self):
        sale = self.anonymous_sale()
        login_client(self.client, self.owner)

        response = self.post(f"{SALES}/{sale['id']}/void", {"reason": "Error"})

        self.assertEqual(response.status_code, 200, response.json())
        self.assertIsNone(response.json()["customer"])

    def test_settlement_sheet_shows_empty_customer(self):
        sale = self.anonymous_sale()
        self.as_owner()

        sheet = self.post(DAILY, {"mechanic": self.carlos.pk}).json()

        row = next(service for service in sheet["services"] if service["sale_number"] == sale["number"])
        self.assertEqual(row["customer"], "")
        self.assertEqual(self.client.get(f"/api/v1/mechanic-settlements/{sheet['id']}").json(), sheet)

    def test_return_and_deduction_work_without_customer(self):
        sale = self.anonymous_sale()
        self.as_owner()

        response = self.post(f"{SALES}/{sale['id']}/returns", self.part_data(
            cause=ReturnCause.BAD_SERVICE, items=[], services=[sale["services"][0]["id"]],
            refunds=[{"method": "cash", "amount": 15000}],
        ))

        self.assertEqual(response.status_code, 201, response.json())
        self.assertIsNone(response.json()["customer"])
        rows = self.client.get(RETURNS).json()["results"]
        self.assertIsNone(rows[0]["customer"])
        deduction = self.client.get(DEDUCTIONS).json()["results"][0]
        self.assertEqual(deduction["customer"], "")

        # 30.000 de mano de obra del día (esta venta y la del setUp): su parte, 18.000, cubre el descuento.
        sheet = self.post(DAILY, {"mechanic": self.carlos.pk}).json()
        self.assertEqual(sheet["deductions"][0]["customer"], "")
