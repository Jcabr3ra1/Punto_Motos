import uuid
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Role
from apps.catalog.models import Category
from apps.core.models import PaymentMethod
from apps.inventory.models import InventoryMovement, MovementKind
from apps.sales.models import ReturnCause, ReturnCondition, Sale, SaleReturn
from apps.workshop.models import Mechanic

from .helpers import APP_TOKEN, login_client, make_user, open_cash
from .test_catalog_models import make_product
from .test_sales_models import finish_initial_count
from .test_workshop_models import make_service_type


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SalesSummaryApiTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        open_cash(self.owner)
        self.tires = Category.objects.create(name="Neumáticos", abbreviation="NEU")
        self.oils = Category.objects.create(name="Aceites", abbreviation="ACE")
        self.tire = make_product(
            code="NEU-UNI-001", name="Neumático 90/90-18", category=self.tires, cost_price=40000, sale_price=60000,
        )
        self.oil = make_product(
            code="ACE-UNI-001", name="Aceite 20W50", category=self.oils, cost_price=20000, sale_price=30000,
        )
        InventoryMovement.objects.record(self.tire, MovementKind.INITIAL_COUNT, 20, self.owner)
        InventoryMovement.objects.record(self.oil, MovementKind.INITIAL_COUNT, 20, self.owner)
        finish_initial_count(self.owner)

        self.mechanic = Mechanic.objects.create(name="Carlos", labor_percentage=50)
        self.patch = make_service_type(code=101, name="Deshinchada", suggested_price=10000)

    def _sell(self, items=(), services=(), created_at=None):
        total = sum(p.sale_price * q for p, q in items) + sum(s.suggested_price for s in services)
        sale, _ = Sale.objects.confirm(
            customer=None,
            items=[{"product": p, "quantity": q} for p, q in items],
            services=[{"service_type": s, "mechanic": self.mechanic} for s in services],
            payments=[{"method": PaymentMethod.CASH, "amount": total}],
            user=self.owner,
            idempotency_key=str(uuid.uuid4()),
        )
        if created_at is not None:
            Sale.objects.filter(pk=sale.pk).update(created_at=created_at)
        return sale

    def test_seller_cannot_access_summary(self):
        login_client(self.client, self.seller)
        response = self.client.get("/api/v1/sales/summary")
        self.assertEqual(response.status_code, 403)

    def test_empty_range_returns_zeroes(self):
        login_client(self.client, self.owner)
        response = self.client.get("/api/v1/sales/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        today = timezone.localdate().isoformat()
        self.assertEqual(data["date_from"], today)
        self.assertEqual(data["date_to"], today)
        self.assertEqual(
            data["totals"],
            {
                "products_quantity": 0,
                "products_total": 0,
                "services_count": 0,
                "services_total": 0,
                "grand_total": 0,
            },
        )
        self.assertEqual(data["categories"], [])
        self.assertEqual(data["services"], [])
        self.assertEqual(data["products"], [])

    def test_aggregates_by_category_service_and_product_excluding_voids_and_returns(self):
        login_client(self.client, self.owner)
        # Venta 1: 3 neumáticos (180k) + 2 deshinchadas (20k)
        sale1 = self._sell(items=[(self.tire, 3)], services=[self.patch, self.patch])
        # Devolución parcial de 1 neumático y 1 deshinchada -> quedan 2 neumáticos (120k) y 1 deshinchada (10k)
        SaleReturn.objects.register(
            sale=sale1,
            cause=ReturnCause.OTHER,
            reason="Cambio",
            items=[{"sale_item": sale1.items.get(), "quantity": 1, "condition": ReturnCondition.RESELLABLE}],
            services=[sale1.services.first()],
            refunds=[{"method": PaymentMethod.CASH, "amount": 70000}],
            user=self.owner,
            idempotency_key=str(uuid.uuid4()),
        )
        # Venta 2: 2 aceites (60k)
        self._sell(items=[(self.oil, 2)])
        # Venta 3 anulada: no debe contar
        voided = self._sell(items=[(self.tire, 5)])
        voided.void(reason="Error", user=self.owner)
        # Venta 4 de ayer: fuera de rango de hoy
        yesterday = timezone.now() - timedelta(days=1)
        self._sell(items=[(self.oil, 4)], created_at=yesterday)

        response = self.client.get("/api/v1/sales/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(
            data["totals"],
            {
                "products_quantity": 4,
                "products_total": 180000,
                "services_count": 1,
                "services_total": 10000,
                "grand_total": 190000,
            },
        )
        self.assertEqual(
            data["categories"],
            [
                {"id": self.tires.id, "name": "Neumáticos", "quantity": 2, "total": 120000},
                {"id": self.oils.id, "name": "Aceites", "quantity": 2, "total": 60000},
            ],
        )
        self.assertEqual(
            data["services"],
            [{"id": self.patch.id, "name": "Deshinchada", "count": 1, "total": 10000}],
        )
        self.assertEqual(
            data["products"],
            [
                {
                    "id": self.tire.id,
                    "code": "NEU-UNI-001",
                    "name": "Neumático 90/90-18",
                    "category_id": self.tires.id,
                    "category_name": "Neumáticos",
                    "quantity": 2,
                    "total": 120000,
                },
                {
                    "id": self.oil.id,
                    "code": "ACE-UNI-001",
                    "name": "Aceite 20W50",
                    "category_id": self.oils.id,
                    "category_name": "Aceites",
                    "quantity": 2,
                    "total": 60000,
                },
            ],
        )

        # Con rango que incluye ayer, suma los 4 aceites de ayer (120k)
        yesterday_str = yesterday.date().isoformat()
        today_str = timezone.localdate().isoformat()
        full = self.client.get("/api/v1/sales/summary", {"date_from": yesterday_str, "date_to": today_str}).json()
        self.assertEqual(full["totals"]["products_quantity"], 8)
        self.assertEqual(full["totals"]["products_total"], 300000)
        self.assertEqual(full["totals"]["grand_total"], 310000)
