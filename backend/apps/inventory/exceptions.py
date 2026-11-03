from rest_framework import status
from rest_framework.exceptions import APIException


class InitialCountFinished(APIException):
    """El conteo inicial ya se cerró: no se cargan más productos ni se vuelve a cerrar."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "initial_count_finished"
    default_detail = "El inventario inicial ya terminó: usa compras o ajustes."


class InitialCountInProgress(APIException):
    """El conteo inicial sigue abierto: no salen unidades (ventas, consignaciones) hasta terminarlo."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "initial_count_open"
    default_detail = "El inventario inicial sigue abierto: termínalo antes de sacar mercancía."
