"""Protección de la API local: origen permitido y credencial efímera."""
import hmac

from django.conf import settings
from django.http import HttpResponse, JsonResponse

API_PREFIX = "/api/"


class LocalApiGuardMiddleware:
    """Solo deja pasar a la API las llamadas de la ventana de Tauri o del propio Tauri.

    - Un navegador que llame desde otro origen recibe 403, aunque conozca el puerto.
    - Toda llamada debe traer la credencial efímera en la cabecera configurada.
      Si no hay credencial configurada (desarrollo con runserver) no se exige.
    - Las solicitudes previas de CORS (OPTIONS) se responden aquí, sin credencial,
      porque el navegador no envía cabeceras personalizadas en ellas.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(API_PREFIX):
            return self.get_response(request)

        origin = request.headers.get("Origin")
        if origin and origin not in settings.PUNTO_MOTO_ALLOWED_ORIGINS:
            return _error(403, "origin_not_allowed", "El origen de la solicitud no está permitido.")

        if request.method == "OPTIONS" and origin:
            return self._add_cors_headers(HttpResponse(status=204), origin, preflight=True)

        expected = settings.PUNTO_MOTO_TOKEN
        if expected:
            received = request.headers.get(settings.PUNTO_MOTO_TOKEN_HEADER, "")
            if not hmac.compare_digest(received.encode(), expected.encode()):
                response = _error(401, "invalid_app_token", "Falta la credencial de la aplicación o no es válida.")
                return self._add_cors_headers(response, origin) if origin else response

        response = self.get_response(request)
        return self._add_cors_headers(response, origin) if origin else response

    @staticmethod
    def _add_cors_headers(response, origin, preflight=False):
        response["Access-Control-Allow-Origin"] = origin
        response["Vary"] = "Origin"
        if preflight:
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE"
            response["Access-Control-Allow-Headers"] = (
                f"Content-Type, Authorization, {settings.PUNTO_MOTO_TOKEN_HEADER}"
            )
            response["Access-Control-Max-Age"] = "600"
        return response


def _error(status, code, message):
    return JsonResponse({"code": code, "message": message, "fields": {}}, status=status)
