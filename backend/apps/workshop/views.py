from apps.catalog.views import CatalogViewSet

from .models import Mechanic, ServiceType
from .serializers import MechanicSerializer, ServiceTypeSerializer


class ServiceTypeViewSet(CatalogViewSet):
    """Tipos de servicio, ordenados por código. Todos consultan; solo el dueño crea y edita.

    La lista es corta y no se pagina: la ventana la guarda y busca el código
    (101) sin volver a preguntarle al backend.
    """

    queryset = ServiceType.objects.all()
    serializer_class = ServiceTypeSerializer


class MechanicViewSet(CatalogViewSet):
    """Mecánicos. Todos los consultan para elegirlos en la venta; solo el dueño los crea y edita.

    El vendedor no recibe los porcentajes de la mano de obra.
    """

    queryset = Mechanic.objects.all()
    serializer_class = MechanicSerializer
