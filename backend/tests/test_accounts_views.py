from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token

from apps.accounts.models import Role, User

from .helpers import APP_TOKEN, PASSWORD, login_client, make_user

JSON = "application/json"


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SetupTests(TestCase):
    def setUp(self):
        login_client(self.client)

    def test_status_says_owner_is_missing_on_first_run(self):
        self.assertEqual(self.client.get("/api/v1/setup/status").json(), {"needs_owner": True})

    def test_creates_first_owner_and_opens_session(self):
        response = self.client.post(
            "/api/v1/setup/owner", {"username": "Dueno", "first_name": "Carlos", "password": PASSWORD}, content_type=JSON
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["role"], "owner")
        self.assertTrue(Token.objects.filter(key=body["token"], user__username="dueno").exists())
        self.assertEqual(self.client.get("/api/v1/setup/status").json(), {"needs_owner": False})

    def test_ignores_role_sent_by_client(self):
        response = self.client.post(
            "/api/v1/setup/owner", {"username": "dueno", "role": "seller", "password": PASSWORD}, content_type=JSON
        )

        self.assertEqual(response.json()["user"]["role"], "owner")

    def test_only_works_once(self):
        make_user("dueno", role=Role.OWNER)

        response = self.client.post(
            "/api/v1/setup/owner", {"username": "intruso", "password": PASSWORD}, content_type=JSON
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="intruso").exists())


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class SessionTests(TestCase):
    def setUp(self):
        self.user = make_user("ana")
        login_client(self.client)

    def login(self, password=PASSWORD):
        return self.client.post("/api/v1/auth/login", {"username": "ana", "password": password}, content_type=JSON)

    def test_login_returns_token_and_user(self):
        response = self.login()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["username"], "ana")
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

    def test_wrong_password_returns_generic_error(self):
        response = self.login(password="otra-clave-999")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["non_field_errors"], ["Usuario o contraseña incorrectos."])

    def test_new_login_replaces_previous_session(self):
        first = self.login().json()["token"]
        second = self.login().json()["token"]

        self.assertNotEqual(first, second)
        self.assertFalse(Token.objects.filter(key=first).exists())

    def test_me_and_logout(self):
        token = self.login().json()["token"]
        self.client.defaults["HTTP_AUTHORIZATION"] = f"Token {token}"

        self.assertEqual(self.client.get("/api/v1/auth/me").json()["username"], "ana")
        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)

    def test_login_is_rate_limited(self):
        for _ in range(10):
            self.login(password="otra-clave-999")

        response = self.login()

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["code"], "throttled")
        self.assertEqual(response.json()["message"], "Demasiados intentos. Espera un minuto y vuelve a intentarlo.")


@override_settings(PUNTO_MOTO_TOKEN=APP_TOKEN)
class UserAdministrationTests(TestCase):
    def setUp(self):
        self.owner = make_user("dueno", role=Role.OWNER)
        self.seller = make_user("ana")
        login_client(self.client, self.owner)

    def test_owner_lists_users(self):
        response = self.client.get("/api/v1/users")

        self.assertEqual(response.status_code, 200)
        self.assertEqual([u["username"] for u in response.json()], ["ana", "dueno"])

    def test_seller_cannot_manage_users(self):
        login_client(self.client, self.seller)

        for response in [
            self.client.get("/api/v1/users"),
            self.client.post("/api/v1/users", {"username": "x", "role": "seller", "password": PASSWORD}, content_type=JSON),
            self.client.patch(f"/api/v1/users/{self.seller.pk}", {"role": "owner"}, content_type=JSON),
        ]:
            self.assertEqual(response.status_code, 403)
        self.seller.refresh_from_db()
        self.assertEqual(self.seller.role, Role.SELLER)

    def test_owner_creates_user(self):
        response = self.client.post(
            "/api/v1/users", {"username": "Beto", "role": "seller", "password": PASSWORD}, content_type=JSON
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["username"], "beto")
        self.assertNotIn("password", response.json())

    def test_cannot_delete_users(self):
        response = self.client.delete(f"/api/v1/users/{self.seller.pk}")

        self.assertEqual(response.status_code, 405)
        self.assertTrue(User.objects.filter(pk=self.seller.pk).exists())

    def test_deactivating_user_closes_their_session(self):
        Token.objects.create(user=self.seller)

        response = self.client.patch(f"/api/v1/users/{self.seller.pk}", {"is_active": False}, content_type=JSON)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Token.objects.filter(user=self.seller).exists())

    def test_owner_cannot_demote_themselves_when_last_owner(self):
        response = self.client.patch(f"/api/v1/users/{self.owner.pk}", {"role": "seller"}, content_type=JSON)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["fields"]["non_field_errors"], ["Debe quedar al menos un dueño activo."])

    def test_set_password_closes_session(self):
        Token.objects.create(user=self.seller)

        response = self.client.post(
            f"/api/v1/users/{self.seller.pk}/set-password", {"new_password": "repuestos-nuevos-9"}, content_type=JSON
        )

        self.assertEqual(response.status_code, 204)
        self.seller.refresh_from_db()
        self.assertTrue(self.seller.check_password("repuestos-nuevos-9"))
        self.assertFalse(Token.objects.filter(user=self.seller).exists())
