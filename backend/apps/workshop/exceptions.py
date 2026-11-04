from rest_framework import status
from rest_framework.exceptions import APIException


class NothingPending(APIException):
    """El mecánico no tiene servicios sin pagar ese día (quizá ya se le pagaron)."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "nothing_to_settle"
    default_detail = "El mecánico no tiene servicios pendientes de pago ese día."
