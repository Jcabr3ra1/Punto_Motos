from contextlib import closing
from datetime import timedelta
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import uuid

from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from apps.accounts.models import Role
from apps.cash.models import CashMovement, CashMovementKind, CashSession
from apps.catalog.models import Category
from apps.consignments.models import Consignee, ConsigneePayment, ConsignmentDelivery, ConsignmentReport
from apps.core.backups import create_verified_backup_bytes
from apps.core.models import BusinessSettings, PaymentMethod
from apps.inventory.models import InventoryMovement, MovementKind
from apps.purchases.models import Purchase, Supplier, SupplierPayment
from apps.sales.models import ReturnCause, ReturnCondition, Sale, SaleReturn
from apps.workshop.models import Mechanic, MechanicSettlement

from .helpers import APP_TOKEN, login_client, make_user, open_cash
from .test_catalog_models import make_product
from .test_sales_models import finish_initial_count
from .test_workshop_models import make_service_type


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class BackupDownloadApiTests(TransactionTestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")

    def test_requires_owner(self):
        login_client(self.client)
        self.assertEqual(self.client.get("/api/v1/backups/download").status_code, 401)

        login_client(self.client, self.seller)
        self.assertEqual(self.client.get("/api/v1/backups/download").status_code, 403)

    def test_owner_downloads_verified_sqlite_and_updates_last_backup_at(self):
        BusinessSettings.objects.update_or_create(pk=1, defaults={"name": "Taller Prueba"})
        login_client(self.client, self.owner)

        settings_before = self.client.get("/api/v1/settings/business").json()
        self.assertIsNone(settings_before["last_backup_at"])

        response = self.client.get("/api/v1/backups/download")
        self.assertEqual(response.status_code, 200)
        self.assertIn(".sqlite3", response["Content-Disposition"])
        body = response.content
        self.assertEqual(response["X-Backup-Sha256"], hashlib.sha256(body).hexdigest())

        tmp = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
        tmp_path = Path(tmp.name)
        tmp.close()
        try:
            tmp_path.write_bytes(body)
            with closing(sqlite3.connect(tmp_path)) as conn:
                self.assertEqual(conn.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
                names = conn.execute("SELECT name FROM core_businesssettings").fetchall()
                self.assertEqual(names, [("Taller Prueba",)])
        finally:
            tmp_path.unlink(missing_ok=True)

        settings_after = self.client.get("/api/v1/settings/business").json()
        self.assertIsNotNone(settings_after["last_backup_at"])

    def test_file_wal_database_backup_preserves_committed_wal_data(self):
        with tempfile.TemporaryDirectory() as directory:
            db_file = Path(directory) / "punto_moto.sqlite3"
            with closing(sqlite3.connect(db_file)) as conn:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("CREATE TABLE demo (label TEXT)")
                conn.execute("INSERT INTO demo VALUES ('venta-wal')")
                conn.commit()
                with override_settings(DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": db_file}}):
                    data, sha = create_verified_backup_bytes()
            self.assertEqual(sha, hashlib.sha256(data).hexdigest())
            copy_file = Path(directory) / "copia.sqlite3"
            copy_file.write_bytes(data)
            with closing(sqlite3.connect(copy_file)) as copied:
                self.assertEqual(copied.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
                self.assertEqual(copied.execute("SELECT label FROM demo").fetchall(), [("venta-wal",)])


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class MonthlyReportApiTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        BusinessSettings.objects.update_or_create(
            pk=1,
            defaults={"name": "Punto Moto", "tax_id": "900123456", "address": "Cra 10", "phone": "3000000"},
        )
        open_cash(self.owner)
        self.cat_frenos = Category.objects.create(name="Frenos", abbreviation="FRE")
        self.pastillas = make_product(
            code="FRE-UNI-001",
            name="Pastillas cerámicas",
            category=self.cat_frenos,
            cost_price=15000,
            sale_price=25000,
            min_stock=5,
        )
        self.bujia = make_product(
            code="FRE-UNI-002",
            name="Bujía iridio",
            category=self.cat_frenos,
            cost_price=10000,
            sale_price=18000,
            min_stock=3,
        )
        InventoryMovement.objects.record(self.pastillas, MovementKind.INITIAL_COUNT, 10, self.owner)
        InventoryMovement.objects.record(self.bujia, MovementKind.INITIAL_COUNT, 1, self.owner)
        finish_initial_count(self.owner)

        self.mechanic = Mechanic.objects.create(name="Carlos", labor_percentage=60)
        self.service = make_service_type(code=101, name="Cambio de pastillas", suggested_price=20000)

    def test_requires_owner_and_validates_month(self):
        login_client(self.client)
        self.assertEqual(self.client.get("/api/v1/reports/monthly").status_code, 401)

        login_client(self.client, self.seller)
        self.assertEqual(self.client.get("/api/v1/reports/monthly").status_code, 403)

        login_client(self.client, self.owner)
        bad = self.client.get("/api/v1/reports/monthly", {"month": "2026-13"})
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(bad.json()["code"], "validation_error")
        self.assertIn("month", bad.json()["fields"])

    def test_aggregates_all_sections_for_target_month(self):
        today = timezone.localdate()
        current_month = today.strftime("%Y-%m")

        # Sale in target month (2 pastillas = 50k + 1 service = 20k => 70k)
        sale, _ = Sale.objects.confirm(
            customer=None,
            items=[{"product": self.pastillas, "quantity": 2}],
            services=[{"service_type": self.service, "mechanic": self.mechanic}],
            payments=[
                {"method": PaymentMethod.CASH, "amount": 50000},
                {"method": PaymentMethod.TRANSFER, "amount": 20000},
            ],
            user=self.owner,
            idempotency_key=str(uuid.uuid4()),
        )
        # Return 1 pastilla (25k cash refund)
        first_item = sale.items.first()
        SaleReturn.objects.register(
            sale=sale,
            cause=ReturnCause.OTHER,
            reason="No le sirvió",
            user=self.owner,
            idempotency_key=str(uuid.uuid4()),
            items=[{"sale_item": first_item, "quantity": 1, "condition": ReturnCondition.RESELLABLE}],
            refunds=[{"method": PaymentMethod.CASH, "amount": 25000}],
        )
        # Another sale then voided (should count in voided_count, not gross_total)
        voided_sale, _ = Sale.objects.confirm(
            customer=None,
            items=[{"product": self.pastillas, "quantity": 1}],
            services=[],
            payments=[{"method": PaymentMethod.CASH, "amount": 25000}],
            user=self.owner,
            idempotency_key=str(uuid.uuid4()),
        )
        voided_sale.void(self.owner, "Error de prueba")

        # Settle workshop service
        MechanicSettlement.objects.settle(self.mechanic, today, self.owner, PaymentMethod.CASH)

        # Cash manual expense
        CashMovement.objects.spend(CashMovementKind.EXPENSE, 8000, PaymentMethod.CASH, self.owner, "Café taller")

        # Received purchase + payment
        supplier = Supplier.objects.create(name="MotoPartes")
        purchase = Purchase.objects.create(supplier=supplier, created_by=self.owner)
        purchase.items.create(product=self.pastillas, quantity=2, unit_cost=15000)
        purchase.receive(self.owner)
        SupplierPayment.objects.record(supplier, 12000, PaymentMethod.CASH, self.owner, paid_on=today)

        # Consignment delivery + report + payment
        local = Consignee.objects.create(name="Taller Norte")
        delivery, _ = ConsignmentDelivery.objects.deliver(
            local,
            [{"product": self.pastillas, "quantity": 2, "unit_value": 20000}],
            self.owner,
            str(uuid.uuid4()),
        )
        item = delivery.items.first()
        ConsignmentReport.objects.record(local, [{"item": item, "sold": 1, "returned": 0}], self.owner)
        ConsigneePayment.objects.record(local, 20000, PaymentMethod.TRANSFER, self.owner)

        # Sale from two months ago (excluded)
        old_dt = timezone.now() - timedelta(days=75)
        old_sale, _ = Sale.objects.confirm(
            customer=None,
            items=[{"product": self.pastillas, "quantity": 1}],
            services=[],
            payments=[{"method": PaymentMethod.CASH, "amount": 25000}],
            user=self.owner,
            idempotency_key=str(uuid.uuid4()),
        )
        Sale.objects.filter(pk=old_sale.pk).update(created_at=old_dt)

        login_client(self.client, self.owner)
        response = self.client.get("/api/v1/reports/monthly", {"month": current_month})
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data["month"], current_month)
        self.assertEqual(data["business"]["name"], "Punto Moto")
        self.assertEqual(data["sales"]["count"], 1)
        self.assertEqual(data["sales"]["voided_count"], 1)
        self.assertEqual(data["sales"]["products_quantity"], 1)
        self.assertEqual(data["sales"]["products_total"], 25000)
        self.assertEqual(data["sales"]["services_count"], 1)
        self.assertEqual(data["sales"]["services_total"], 20000)
        self.assertEqual(data["sales"]["gross_total"], 70000)
        self.assertEqual(data["sales"]["returns_count"], 1)
        self.assertEqual(data["sales"]["returns_total"], 25000)
        self.assertEqual(data["sales"]["net_total"], 45000)
        self.assertEqual(data["sales"]["cash_total"], 25000)
        self.assertEqual(data["sales"]["transfer_total"], 20000)

        self.assertEqual(data["cash"]["expenses_total"], 8000)
        self.assertEqual(data["purchases"]["received_count"], 1)
        self.assertEqual(data["purchases"]["received_total"], 30000)
        self.assertEqual(data["purchases"]["payments_total"], 12000)
        self.assertEqual(data["workshop"]["settlements_count"], 1)
        self.assertEqual(data["workshop"]["labor_total"], 20000)
        self.assertEqual(data["workshop"]["mechanic_paid_total"], 12000)
        self.assertEqual(data["workshop"]["shop_share_total"], 8000)
        self.assertEqual(data["consignments"]["deliveries_count"], 1)
        self.assertEqual(data["consignments"]["reports_total"], 20000)
        self.assertEqual(data["consignments"]["payments_total"], 20000)
        self.assertEqual(len(data["daily"]), 1)
        self.assertEqual(data["daily"][0]["net_total"], 45000)
        # Only bujia has stock 1 <= min_stock 3 (pastillas went 10 - 2 + 1 - 1 + 1 + 2 - 2 = 9 > 5)
        self.assertEqual([p["code"] for p in data["low_stock"]], ["FRE-UNI-002"])


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class NotificationsApiTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        cat = Category.objects.create(name="Frenos", abbreviation="FRE")
        self.agotado = make_product(
            code="FRE-PUL-001", name="Pastillas Pulsar", category=cat, min_stock=4,
        )
        bujia = make_product(
            code="FRE-UNI-002", name="Bujía NGK", category=cat, min_stock=3,
        )
        filtro = make_product(
            code="FRE-UNI-003", name="Filtro aire", category=cat, min_stock=2,
        )
        InventoryMovement.objects.record(bujia, MovementKind.INITIAL_COUNT, 1, self.owner)
        InventoryMovement.objects.record(filtro, MovementKind.INITIAL_COUNT, 10, self.owner)
        finish_initial_count(self.owner)

    def test_notifications_require_auth_and_hide_owner_alerts_from_seller(self):
        login_client(self.client)
        self.assertEqual(self.client.get("/api/v1/notifications").status_code, 401)

        login_client(self.client, self.seller)
        seller_res = self.client.get("/api/v1/notifications")
        self.assertEqual(seller_res.status_code, 200)
        seller_data = seller_res.json()
        self.assertEqual(seller_data["low_stock_count"], 2)
        self.assertEqual([p["code"] for p in seller_data["low_stock"]], ["FRE-PUL-001", "FRE-UNI-002"])
        self.assertEqual(seller_data["alerts"], [])

    def test_owner_sees_operational_alerts(self):
        supplier = Supplier.objects.create(name="MotoPartes")
        Purchase.objects.create(supplier=supplier, created_by=self.owner)
        session = open_cash(self.owner, 100000)
        CashSession.objects.filter(pk=session.pk).update(opened_at=timezone.now() - timedelta(days=1))

        login_client(self.client, self.owner)
        res = self.client.get("/api/v1/notifications")
        self.assertEqual(res.status_code, 200)
        keys = [a["key"] for a in res.json()["alerts"]]
        self.assertIn("cash_previous_day", keys)
        self.assertIn("missing_backup", keys)
        self.assertIn("draft_purchases", keys)
