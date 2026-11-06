from rest_framework import status
from rest_framework.exceptions import APIException


class ProductHasHistory(APIException):
    """El producto ya se usó en algún documento: borrarlo dañaría ese historial."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "product_has_history"
    default_detail = "Este producto ya tiene historial: no se puede eliminar, desactívalo."
