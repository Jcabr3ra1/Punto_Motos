from django.core.cache import cache
from rest_framework.authtoken.models import Token

from apps.accounts.models import Role, User

APP_TOKEN = "credencial-de-prueba"
PASSWORD = "taller-moto-2026"


def make_user(username, role=Role.SELLER, **extra):
    return User.objects.create_user(username=username, password=PASSWORD, role=role, **extra)


def login_client(client, user=None):
    """Prepara el cliente como lo hará la ventana: credencial del programa y, si hay usuario, su sesión."""
    cache.clear()  # reinicia el límite de intentos de inicio de sesión
    client.defaults["HTTP_X_PUNTO_MOTO_TOKEN"] = APP_TOKEN
    client.defaults.pop("HTTP_AUTHORIZATION", None)
    if user is not None:
        token, _ = Token.objects.get_or_create(user=user)
        client.defaults["HTTP_AUTHORIZATION"] = f"Token {token.key}"
    return client


def open_cash(user, opening_cash=0):
    """Abre la caja: sin ella no se vende ni se registran pagos de hoy."""
    from apps.cash.models import CashSession

    return CashSession.objects.open(opening_cash, user)
