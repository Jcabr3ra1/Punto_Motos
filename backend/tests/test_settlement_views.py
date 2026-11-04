from datetime import timedelta

from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind
from apps.sales.models import Sale
from apps.workshop.models import Mechanic, MechanicSettlement

from .helpers import login_client
from .test_sales_views import SalesApiTestCase
from .test_workshop_models import make_service_type

DAILY = "/api/v1/mechanic-settlements/daily"
LIST = "/api/v1/mechanic-settlements"


class SettlementApiTestCase(SalesApiTestCase):
    def setUp(self):
        super().setUp()
        self.oil = make_service_type()
        self.carlos = Mechanic.objects.create(name="Carlos Ruiz")
        self.pedro = Mechanic.objects.create(name="Pedro Gómez", labor_percentage=50)
        self.today = timezone.localdate()

    def sell_service(self, mechanic, with_part=False):
        """Venta hecha por el vendedor: un cambio de aceite y, si se pide, un repuesto."""
        data = self.sale_data(
            quantity=1, services=[{"service_type": self.oil.pk, "mechanic": mechanic.pk}],
            payments=[{"method": "cash", "amount": 40000 if with_part else 15000}],
        )
        if not with_part:
            data["items"] = []
        response = self.post("/api/v1/sales", data)
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()

    def as_owner(self):
        login_client(self.client, self.owner)


class DailySettlementApiTests(SettlementApiTestCase):
    def test_owner_sees_preview_and_pays_each_mechanic(self):
        self.sell_service(self.carlos, with_part=True)
        self.sell_service(self.carlos)
        self.sell_service(self.pedro)
        self.as_owner()

        data = self.client.get(DAILY).json()
        self.assertEqual(data["date"], self.today.isoformat())
        self.assertEqual(
            [(row["mechanic"]["name"], row["labor_total"], row["percentage"], row["amount"]) for row in data["mechanics"]],
            [("Carlos Ruiz", 30000, 60, 18000), ("Pedro Gómez", 15000, 50, 7500)],
        )
        self.assertEqual(data["total"], 25500)

        response = self.post(DAILY, {"mechanic": self.carlos.pk})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["amount"], 18000)
        self.assertEqual(len(response.json()["services"]), 2)
        payment = CashMovement.objects.get(kind=CashMovementKind.MECHANIC_PAYMENT)
        self.assertEqual(payment.amount, -18000)
        movements = self.client.get("/api/v1/cash-movements", {"kind": "mechanic_payment"}).json()["results"]
        self.assertEqual(movements[0]["mechanic_settlement"], response.json()["id"])
        self.assertEqual(movements[0]["kind_label"], "Pago a mecánico")

        data = self.client.get(DAILY).json()
        self.assertEqual([row["mechanic"]["name"] for row in data["mechanics"]], ["Pedro Gómez"])

    def test_preview_of_other_day_and_invalid_date(self):
        sale = self.sell_service(self.carlos)
        yesterday = self.today - timedelta(days=1)
        Sale.objects.filter(pk=sale["id"]).update(created_at=timezone.now() - timedelta(days=1))
        self.as_owner()

        self.assertEqual(self.client.get(DAILY).json()["mechanics"], [])
        data = self.client.get(DAILY, {"date": yesterday.isoformat()}).json()
        self.assertEqual(data["total"], 9000)
        self.assertEqual(self.client.get(DAILY, {"date": "ayer"}).status_code, 400)

    def test_paying_twice_is_a_409(self):
        self.sell_service(self.carlos)
        self.as_owner()
        self.post(DAILY, {"mechanic": self.carlos.pk})

        response = self.post(DAILY, {"mechanic": self.carlos.pk})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "nothing_to_settle")
        self.assertEqual(MechanicSettlement.objects.count(), 1)

    def test_seller_cannot_see_or_pay(self):
        self.sell_service(self.carlos)

        self.assertEqual(self.client.get(DAILY).status_code, 403)
        self.assertEqual(self.post(DAILY, {"mechanic": self.carlos.pk}).status_code, 403)
        self.assertEqual(self.client.get(LIST).status_code, 403)
        self.assertFalse(MechanicSettlement.objects.exists())


class SettlementHistoryApiTests(SettlementApiTestCase):
    def test_lists_filters_and_shows_detail(self):
        self.sell_service(self.carlos)
        self.sell_service(self.pedro)
        self.as_owner()
        carlos = self.post(DAILY, {"mechanic": self.carlos.pk}).json()
        self.post(DAILY, {"mechanic": self.pedro.pk, "method": "transfer"})

        data = self.client.get(LIST).json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(data["results"][0]["mechanic"]["name"], "Pedro Gómez")
        self.assertEqual(data["results"][0]["services_count"], 1)
        self.assertNotIn("services", data["results"][0])

        data = self.client.get(LIST, {"mechanic": self.carlos.pk}).json()
        self.assertEqual([s["id"] for s in data["results"]], [carlos["id"]])
        tomorrow = (self.today + timedelta(days=1)).isoformat()
        self.assertEqual(self.client.get(LIST, {"date_from": tomorrow}).json()["count"], 0)
        self.assertEqual(self.client.get(LIST, {"date_to": self.today.isoformat()}).json()["count"], 2)

        detail = self.client.get(f"{LIST}/{carlos['id']}").json()
        self.assertEqual(detail, carlos)
        self.assertEqual(self.client.get(f"{LIST}/9999").status_code, 404)


class VoidSettledSaleApiTests(SettlementApiTestCase):
    def test_voiding_sale_already_paid_to_mechanic_is_a_409(self):
        sale = self.sell_service(self.carlos)
        self.as_owner()
        self.post(DAILY, {"mechanic": self.carlos.pk})

        response = self.post(f"/api/v1/sales/{sale['id']}/void", {"reason": "Error"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["code"], "sale_has_settled_services")
