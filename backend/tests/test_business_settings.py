from django.db import IntegrityError
from django.test import TestCase, override_settings

from apps.accounts.models import Role
from apps.core.models import BusinessSettings

from .helpers import APP_TOKEN, login_client, make_user

URL = "/api/v1/settings/business"


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class BusinessSettingsApiTests(TestCase):
    def setUp(self):
        login_client(self.client, make_user("dueno", role=Role.OWNER))

    def test_requires_login(self):
        login_client(self.client)

        response = self.client.get(URL)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "not_authenticated")

    def test_seller_can_read_but_not_change(self):
        login_client(self.client, make_user("ana"))

        self.assertEqual(self.client.get(URL).status_code, 200)
        response = self.client.put(URL, {"name": "Otro nombre"}, content_type="application/json")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "permission_denied")

    def test_get_returns_empty_settings_on_first_use(self):
        response = self.client.get(URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "")

    def test_put_persists_data(self):
        payload = {
            "name": "Punto Moto",
            "tax_id": "900123456",
            "address": "Calle 1 # 2-3",
            "phone": "3001234567",
            "receipt_footer": "Gracias por su compra",
        }

        response = self.client.put(URL, payload, content_type="application/json")

        self.assertEqual(response.status_code, 200)
        saved = BusinessSettings.objects.get(pk=BusinessSettings.SINGLETON_PK)
        self.assertEqual(saved.name, "Punto Moto")
        self.assertEqual(saved.receipt_footer, "Gracias por su compra")
        self.assertEqual(self.client.get(URL).json()["phone"], "3001234567")

    def test_patch_changes_only_sent_fields(self):
        self.client.put(URL, {"name": "Punto Moto", "phone": "111"}, content_type="application/json")

        response = self.client.patch(URL, {"phone": "222"}, content_type="application/json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Punto Moto")
        self.assertEqual(response.json()["phone"], "222")

    def test_blank_name_returns_field_error(self):
        response = self.client.put(URL, {"name": "   "}, content_type="application/json")

        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["code"], "validation_error")
        self.assertIn("name", body["fields"])

    def test_only_one_settings_row_can_exist(self):
        BusinessSettings.load()

        with self.assertRaises(IntegrityError):
            BusinessSettings.objects.create(pk=2, name="Otro")
