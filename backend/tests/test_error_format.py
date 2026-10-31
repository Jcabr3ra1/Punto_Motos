from django.test import TestCase, override_settings

TOKEN = "credencial-de-prueba"


@override_settings(PUNTO_MOTO_TOKEN=TOKEN)
class ErrorFormatTests(TestCase):
    def setUp(self):
        self.client.defaults["HTTP_X_PUNTO_MOTO_TOKEN"] = TOKEN

    def test_unknown_route_returns_json_error(self):
        response = self.client.get("/api/v1/no-existe")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {
            "code": "not_found",
            "message": "No se encontró el registro solicitado.",
            "fields": {},
        })

    def test_unsupported_method_returns_json_error(self):
        response = self.client.delete("/api/v1/health")

        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.json()["code"], "method_not_allowed")
