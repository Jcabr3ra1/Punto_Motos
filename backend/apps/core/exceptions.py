"""Formato estable de errores de la API: código, mensaje y errores por campo."""
from rest_framework import exceptions, status
from rest_framework.views import exception_handler

MESSAGES = {
    status.HTTP_400_BAD_REQUEST: "Revisa los datos marcados.",
    status.HTTP_404_NOT_FOUND: "No se encontró el registro solicitado.",
    status.HTTP_405_METHOD_NOT_ALLOWED: "Operación no permitida.",
    status.HTTP_429_TOO_MANY_REQUESTS: "Demasiados intentos. Espera un minuto y vuelve a intentarlo.",
}


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        detail = exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail}
        response.data = {
            "code": "validation_error",
            "message": MESSAGES[status.HTTP_400_BAD_REQUEST],
            "fields": detail,
        }
    else:
        code = exc.get_codes() if isinstance(exc, exceptions.APIException) else "error"
        response.data = {
            "code": code if isinstance(code, str) else "error",
            "message": MESSAGES.get(response.status_code, str(getattr(exc, "detail", exc))),
            "fields": {},
        }
    return response
