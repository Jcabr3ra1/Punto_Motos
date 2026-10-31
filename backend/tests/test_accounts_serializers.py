from django.test import TestCase

from apps.accounts.models import Role, User
from apps.accounts.serializers import (
    LAST_OWNER_MESSAGE,
    LoginSerializer,
    SetPasswordSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)

GOOD_PASSWORD = "taller-moto-2026"


class UserSerializerTests(TestCase):
    def test_never_exposes_password(self):
        user = User.objects.create_user(username="ana", password=GOOD_PASSWORD, role=Role.SELLER)

        data = UserSerializer(user).data

        self.assertNotIn("password", data)
        self.assertEqual(data["role"], "seller")
        self.assertEqual(data["role_label"], "Vendedor")


class UserCreateSerializerTests(TestCase):
    def test_creates_user_with_hashed_password(self):
        serializer = UserCreateSerializer(data={"username": "Ana", "role": "seller", "password": GOOD_PASSWORD})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()

        self.assertEqual(user.username, "ana")
        self.assertTrue(user.check_password(GOOD_PASSWORD))
        self.assertNotIn("password", serializer.data)

    def test_username_is_unique_ignoring_case_and_spaces(self):
        User.objects.create_user(username="ana", password=GOOD_PASSWORD)

        serializer = UserCreateSerializer(data={"username": " ANA ", "role": "seller", "password": GOOD_PASSWORD})

        self.assertFalse(serializer.is_valid())
        self.assertIn("username", serializer.errors)

    def test_rejects_weak_passwords(self):
        cases = [
            ("ana", "1234"),                  # muy corta
            ("ana", "12345678"),              # solo números
            ("ana", "password"),              # contraseña común
            ("pedrogomez", "pedrogomez1"),    # casi igual al usuario
        ]
        for username, weak in cases:
            with self.subTest(password=weak):
                serializer = UserCreateSerializer(data={"username": username, "role": "seller", "password": weak})

                self.assertFalse(serializer.is_valid())
                self.assertIn("password", serializer.errors)

    def test_role_is_required(self):
        serializer = UserCreateSerializer(data={"username": "ana", "password": GOOD_PASSWORD})

        self.assertFalse(serializer.is_valid())
        self.assertIn("role", serializer.errors)


class UserUpdateSerializerTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="dueno", password=GOOD_PASSWORD, role=Role.OWNER)

    def test_cannot_demote_last_active_owner(self):
        serializer = UserUpdateSerializer(self.owner, data={"role": "seller"}, partial=True)

        self.assertFalse(serializer.is_valid())
        self.assertEqual(serializer.errors["non_field_errors"], [LAST_OWNER_MESSAGE])

    def test_cannot_deactivate_last_active_owner(self):
        serializer = UserUpdateSerializer(self.owner, data={"is_active": False}, partial=True)

        self.assertFalse(serializer.is_valid())

    def test_can_demote_owner_when_another_active_owner_exists(self):
        User.objects.create_user(username="socio", password=GOOD_PASSWORD, role=Role.OWNER)

        serializer = UserUpdateSerializer(self.owner, data={"role": "seller"}, partial=True)

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_inactive_owner_does_not_count(self):
        User.objects.create_user(username="ex_socio", password=GOOD_PASSWORD, role=Role.OWNER, is_active=False)

        serializer = UserUpdateSerializer(self.owner, data={"is_active": False}, partial=True)

        self.assertFalse(serializer.is_valid())

    def test_can_deactivate_seller(self):
        seller = User.objects.create_user(username="ana", password=GOOD_PASSWORD)

        serializer = UserUpdateSerializer(seller, data={"is_active": False}, partial=True)

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertFalse(serializer.save().is_active)


class SetPasswordSerializerTests(TestCase):
    def test_sets_new_password(self):
        user = User.objects.create_user(username="ana", password=GOOD_PASSWORD)

        serializer = SetPasswordSerializer(user, data={"new_password": "repuestos-nuevos-9"})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        user.refresh_from_db()
        self.assertTrue(user.check_password("repuestos-nuevos-9"))

    def test_rejects_weak_password(self):
        user = User.objects.create_user(username="ana", password=GOOD_PASSWORD)

        serializer = SetPasswordSerializer(user, data={"new_password": "1234"})

        self.assertFalse(serializer.is_valid())
        self.assertIn("new_password", serializer.errors)


class LoginSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="ana", password=GOOD_PASSWORD)

    def test_valid_credentials_return_user(self):
        serializer = LoginSerializer(data={"username": " Ana ", "password": GOOD_PASSWORD})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["user"], self.user)

    def test_same_error_for_wrong_password_unknown_user_and_inactive_user(self):
        inactive = User.objects.create_user(username="beto", password=GOOD_PASSWORD, is_active=False)
        cases = [
            {"username": "ana", "password": "otra-clave-999"},
            {"username": "no_existe", "password": GOOD_PASSWORD},
            {"username": inactive.username, "password": GOOD_PASSWORD},
        ]
        errors = []
        for data in cases:
            serializer = LoginSerializer(data=data)
            self.assertFalse(serializer.is_valid())
            errors.append(serializer.errors)

        self.assertEqual(errors[0], errors[1])
        self.assertEqual(errors[1], errors[2])
        self.assertEqual(errors[0]["non_field_errors"], ["Usuario o contraseña incorrectos."])
