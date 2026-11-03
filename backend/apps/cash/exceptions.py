from rest_framework import status
from rest_framework.exceptions import APIException


class NoOpenCashSession(APIException):
    """No hay caja abierta: no se vende ni se registran pagos de hoy hasta abrirla."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "cash_session_closed"
    default_detail = "La caja está cerrada: ábrela para registrar dinero."
