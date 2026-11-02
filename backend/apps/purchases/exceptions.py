from rest_framework import status
from rest_framework.exceptions import APIException


class PurchaseReceived(APIException):
    """La compra ya se recibió: no se edita, no se borra ni se recibe otra vez."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "purchase_received"
    default_detail = "La compra ya se recibió: no se puede modificar."
