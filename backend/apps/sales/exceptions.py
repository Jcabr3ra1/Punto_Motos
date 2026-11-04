from rest_framework import status
from rest_framework.exceptions import APIException


class SaleVoided(APIException):
    """La venta ya se anuló: no se anula otra vez."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "sale_voided"
    default_detail = "La venta ya está anulada."


class SaleSettled(APIException):
    """Un servicio de la venta ya se le pagó al mecánico: se corrige con una devolución."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "sale_has_settled_services"
    default_detail = "Esta venta tiene servicios ya pagados al mecánico: no se puede anular."
