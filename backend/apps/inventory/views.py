from datetime import date

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOwner
from apps.catalog.views import _id_param
from apps.core.pagination import StandardPagination

from .exceptions import InitialCountFinished
from .models import InitialCount, InventoryMovement, MovementKind
from .serializers import (
    AdjustmentSerializer,
    InitialCountItemSerializer,
    InitialCountSerializer,
    InventoryMovementSerializer,
    WorkshopUseSerializer,
)


def _date_param(request, name):
    """Lee una fecha AAAA-MM-DD de la URL; un valor inválido responde 400."""
    value = request.query_params.get(name)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: ["Usa el formato AAAA-MM-DD."]})


class MovementListView(generics.ListAPIView):
    """Kárdex paginado, del más reciente al más antiguo.

    Filtros: ?product=, ?kind=, ?date_from= y ?date_to= (fechas en hora de Colombia, ambas incluidas).
    """

    serializer_class = InventoryMovementSerializer
    pagination_class = StandardPagination

    def get_queryset(self):
        queryset = InventoryMovement.objects.select_related("product", "created_by")
        product = _id_param(self.request, "product")
        if product:
            queryset = queryset.filter(product_id=product)
        kind = self.request.query_params.get("kind")
        if kind:
            if kind not in MovementKind.values:
                raise ValidationError({"kind": [f"Usa uno de: {', '.join(MovementKind.values)}."]})
            queryset = queryset.filter(kind=kind)
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset


class AdjustmentView(generics.CreateAPIView):
    """Ajuste físico: solo el dueño, siempre con motivo."""

    permission_classes = [IsOwner]
    serializer_class = AdjustmentSerializer


class WorkshopUseView(generics.CreateAPIView):
    """Consumo interno de un insumo de taller: solo el dueño, como los ajustes."""

    permission_classes = [IsOwner]
    serializer_class = WorkshopUseSerializer


class InitialCountView(APIView):
    """Estado del conteo inicial. El vendedor lo consulta para saber si ya se puede vender."""

    def get(self, request):
        return Response(InitialCountSerializer(InitialCount.load()).data)


class InitialCountItemView(generics.CreateAPIView):
    """Carga un producto con su cantidad contada mientras el conteo está abierto."""

    permission_classes = [IsOwner]
    serializer_class = InitialCountItemSerializer


class FinishInitialCountView(APIView):
    """El dueño termina el conteo una sola vez. Desde ahí las existencias solo cambian con documentos o ajustes."""

    permission_classes = [IsOwner]

    def post(self, request):
        InitialCount.load()
        # Actualización condicional: si dos solicitudes llegan juntas, solo una lo cierra.
        closed = InitialCount.objects.filter(pk=InitialCount.SINGLETON_PK, finished_at__isnull=True).update(
            finished_at=timezone.now(), finished_by=request.user,
        )
        if not closed:
            raise InitialCountFinished()
        return Response(InitialCountSerializer(InitialCount.load()).data, status=status.HTTP_200_OK)
