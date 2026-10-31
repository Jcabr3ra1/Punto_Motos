from django.db import IntegrityError
from django.test import TestCase, override_settings

from apps.core.models import BusinessSettings

TOKEN = "credencial-de-prueba"
URL = "/api/v1/settings/business"


@override_settings(PUNTO_MOTO_TOKEN=TOKEN)
class BusinessSettingsApiTests(TestCase):
    def setUp(self):
        self.client.defaults["HTTP_X_PUNTO_MOTO_TOKEN"] = TOKEN

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
