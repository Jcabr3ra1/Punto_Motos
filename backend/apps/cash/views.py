from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsOwner
from apps.catalog.views import _id_param
from apps.core.pagination import StandardPagination
from apps.inventory.views import _date_param

from .models import CashMovement, CashSession
from .serializers import (
    CashMovementSerializer,
    CashSessionListSerializer,
    CashSessionSerializer,
    CloseCashSessionSerializer,
    OpenCashSessionSerializer,
    SpendSerializer,
)


class CashSessionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Cajas. Abrir, cerrar y consultar es solo del dueño.

    GET /cash-sessions/current lo puede pedir cualquier usuario con sesión
    para saber si se puede vender; los montos solo se le envían al dueño.
    POST /cash-sessions abre y POST /cash-sessions/{id}/close cierra.
    Filtros del historial: ?date_from= y ?date_to= (día de apertura).
    """

    permission_classes = [IsOwner]
    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action == "current":
            return [IsAuthenticated()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return OpenCashSessionSerializer
        if self.action == "close":
            return CloseCashSessionSerializer
        if self.action == "list":
            return CashSessionListSerializer
        return CashSessionSerializer

    def get_queryset(self):
        queryset = CashSession.objects.select_related("opened_by", "closed_by")
        if self.action != "list":
            return queryset
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(opened_at__date__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(opened_at__date__lte=date_to)
        return queryset

    @action(detail=False, methods=["get"])
    def current(self, request):
        """La caja abierta (o null) y, para abrir la siguiente, el efectivo contado en el último cierre."""
        session = CashSession.objects.current()
        last_closed = CashSession.objects.filter(closed_at__isnull=False).order_by("-closed_at").first()
        data = {"is_open": session is not None}
        if request.user.is_owner:
            data["session"] = CashSessionSerializer(session).data if session else None
            data["suggested_opening_cash"] = last_closed.counted_cash if last_closed else 0
        return Response(data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        serializer = self.get_serializer(self.get_object(), data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class CashMovementViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Movimientos de caja. Solo el dueño. No se editan ni se borran.

    POST registra un gasto o un retiro del dueño; el resto lo crean las
    ventas, abonos y pagos. Filtros: ?session=, ?kind= y ?method=.
    """

    permission_classes = [IsOwner]
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "create":
            return SpendSerializer
        return CashMovementSerializer

    def get_queryset(self):
        queryset = CashMovement.objects.select_related("sale", "created_by")
        if self.action != "list":
            return queryset
        session = _id_param(self.request, "session")
        if session:
            queryset = queryset.filter(session_id=session)
        for name in ("kind", "method"):
            value = self.request.query_params.get(name)
            if value:
                queryset = queryset.filter(**{name: value})
        return queryset
