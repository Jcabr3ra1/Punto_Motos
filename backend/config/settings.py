"""Configuración del backend local de Punto Moto.

Tauri inicia el backend como sidecar y le entrega por variables de entorno:

- PUNTO_MOTO_DATA_DIR: carpeta de datos elegida por el dueño.
- PUNTO_MOTO_TOKEN: credencial efímera generada en cada inicio.
- PUNTO_MOTO_ALLOWED_ORIGINS: orígenes de la ventana que pueden llamar a la API.

Sin PUNTO_MOTO_DATA_DIR se usa backend/.data, pensado solo para desarrollo.
"""
import os
import secrets
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

APP_VERSION = "0.1.0"

BASE_DIR = Path(__file__).resolve().parent.parent

_data_dir_env = os.environ.get("PUNTO_MOTO_DATA_DIR")
if _data_dir_env:
    DATA_DIR = Path(_data_dir_env)
    # Si falta la carpeta elegida no se crea una base vacía en silencio.
    if not DATA_DIR.is_dir():
        raise ImproperlyConfigured(f"No existe la carpeta de datos configurada: {DATA_DIR}")
else:
    DATA_DIR = BASE_DIR / ".data"
    DATA_DIR.mkdir(exist_ok=True)


def _load_secret_key(data_dir: Path) -> str:
    """Lee la clave de Django guardada junto a los datos o la crea la primera vez."""
    key_file = data_dir / "secret_key"
    if key_file.exists():
        return key_file.read_text(encoding="utf-8").strip()
    key = secrets.token_urlsafe(50)
    key_file.write_text(key, encoding="utf-8")
    return key


SECRET_KEY = _load_secret_key(DATA_DIR)

DEBUG = os.environ.get("PUNTO_MOTO_DEBUG") == "1"

# La API solo escucha en el propio computador.
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

PUNTO_MOTO_TOKEN = os.environ.get("PUNTO_MOTO_TOKEN", "")
PUNTO_MOTO_TOKEN_HEADER = "X-Punto-Moto-Token"
PUNTO_MOTO_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "PUNTO_MOTO_ALLOWED_ORIGINS",
        # Ventana de Tauri en Windows, en Linux y servidor de desarrollo de Vite.
        "http://tauri.localhost,tauri://localhost,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "apps.core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.core.middleware.LocalApiGuardMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": DATA_DIR / "punto_moto.sqlite3",
        "OPTIONS": {
            # IMMEDIATE evita errores de bloqueo al pasar de lectura a escritura.
            "transaction_mode": "IMMEDIATE",
            "timeout": 20,
            "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;",
        },
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = True

REST_FRAMEWORK = {
    # La credencial efímera la valida LocalApiGuardMiddleware; los usuarios
    # del negocio y sus permisos se agregarán con el módulo de sesión.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
