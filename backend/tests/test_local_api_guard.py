from django.test import TestCase, override_settings

TOKEN = "credencial-de-prueba"
WINDOW_ORIGIN = "http://tauri.localhost"


@override_settings(PUNTO_MOTO_TOKEN=TOKEN, PUNTO_MOTO_ALLOWED_ORIGINS=[WINDOW_ORIGIN])
class LocalApiGuardTests(TestCase):
    def test_rejects_request_without_token(self):
        response = self.client.get("/api/v1/health")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "invalid_app_token")

    def test_rejects_wrong_token(self):
        response = self.client.get("/api/v1/health", headers={"X-Punto-Moto-Token": "otra"})

        self.assertEqual(response.status_code, 401)

    def test_accepts_valid_token_without_origin(self):
        # Así llama el proceso de Tauri en Rust para comprobar que el backend arrancó.
        response = self.client.get("/api/v1/health", headers={"X-Punto-Moto-Token": TOKEN})

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Access-Control-Allow-Origin", response)

    def test_window_origin_gets_cors_headers(self):
        response = self.client.get(
            "/api/v1/health", headers={"X-Punto-Moto-Token": TOKEN, "Origin": WINDOW_ORIGIN}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"], WINDOW_ORIGIN)

    def test_rejects_unknown_origin_even_with_token(self):
        response = self.client.get(
            "/api/v1/health", headers={"X-Punto-Moto-Token": TOKEN, "Origin": "https://sitio-externo.com"}
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "origin_not_allowed")

    def test_preflight_from_window_does_not_need_token(self):
        response = self.client.options("/api/v1/settings/business", headers={"Origin": WINDOW_ORIGIN})

        self.assertEqual(response.status_code, 204)
        self.assertIn("X-Punto-Moto-Token", response["Access-Control-Allow-Headers"])

    def test_preflight_from_unknown_origin_is_rejected(self):
        response = self.client.options("/api/v1/settings/business", headers={"Origin": "https://sitio-externo.com"})

        self.assertEqual(response.status_code, 403)


@override_settings(PUNTO_MOTO_TOKEN="")
class DevelopmentWithoutTokenTests(TestCase):
    def test_token_not_required_when_not_configured(self):
        response = self.client.get("/api/v1/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
