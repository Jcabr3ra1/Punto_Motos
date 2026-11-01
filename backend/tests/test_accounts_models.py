from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.accounts.models import Role

User = get_user_model()


class UserModelTests(TestCase):
    def test_new_user_is_seller_by_default(self):
        user = User.objects.create_user(username="vendedor1", password="clave-segura-123")

        self.assertEqual(user.role, Role.SELLER)
        self.assertFalse(user.is_owner)

    def test_password_is_stored_hashed(self):
        user = User.objects.create_user(username="vendedor1", password="clave-segura-123")

        self.assertNotEqual(user.password, "clave-segura-123")
        self.assertTrue(user.check_password("clave-segura-123"))

    def test_superuser_is_owner(self):
        owner = User.objects.create_superuser(username="dueno", password="clave-segura-123")

        self.assertEqual(owner.role, Role.OWNER)
        self.assertTrue(owner.is_owner)

    def test_display_name_uses_full_name_or_username(self):
        user = User.objects.create_user(username="pgomez", first_name="Pedro", last_name="Gómez")

        self.assertEqual(user.display_name, "Pedro Gómez")
        self.assertEqual(User(username="sin_nombre").display_name, "sin_nombre")
