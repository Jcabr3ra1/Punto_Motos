from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response

from apps.accounts.permissions import IsOwner
from apps.catalog.views import CatalogViewSet, _id_param
from apps.core.pagination import StandardPagination
from apps.inventory.views import _date_param

from .models import Mechanic, MechanicSettlement, ServiceType
from .serializers import (
    MechanicSerializer,
    MechanicSettlementDetailSerializer,
    MechanicSettlementSerializer,
    ServiceTypeSerializer,
    SettlementPreviewSerializer,
    SettleSerializer,
)


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


class DailySettlementView(generics.GenericAPIView):
    """Liquidación del día, solo el dueño.

    GET ?date=AAAA-MM-DD (hoy por defecto) muestra lo que se le debe a cada
    mecánico con servicios sin pagar ese día. POST le paga a uno y responde la
    liquidación con sus servicios, lista para imprimir.
    """

    permission_classes = [IsOwner]
    serializer_class = SettleSerializer

    def get(self, request):
        day = _date_param(request, "date") or timezone.localdate()
        rows = MechanicSettlement.objects.preview(day)
        return Response({
            "date": day.isoformat(),
            "mechanics": SettlementPreviewSerializer(rows, many=True).data,
            "total": sum(row["amount"] for row in rows),
        })

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SettlementListView(generics.ListAPIView):
    """Liquidaciones pagadas, de la más reciente a la más antigua. Solo el dueño.

    Filtros: ?mechanic=, ?date_from= y ?date_to= (día liquidado, ambos incluidos).
    """

    permission_classes = [IsOwner]
    serializer_class = MechanicSettlementSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        queryset = MechanicSettlement.objects.select_related("mechanic", "created_by").prefetch_related("services")
        mechanic = _id_param(self.request, "mechanic")
        if mechanic:
            queryset = queryset.filter(mechanic_id=mechanic)
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        return queryset


class SettlementDetailView(generics.RetrieveAPIView):
    """Una liquidación con sus servicios, para reimprimirla. Solo el dueño."""

    permission_classes = [IsOwner]
    serializer_class = MechanicSettlementDetailSerializer
    queryset = MechanicSettlement.objects.select_related("mechanic", "created_by").prefetch_related(
        "services__service_type", "services__sale__customer",
    )
