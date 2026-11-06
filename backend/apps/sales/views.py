from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsOwner
from apps.catalog.text import plain_text
from apps.catalog.views import _flag, _id_param
from apps.core.pagination import StandardPagination
from apps.inventory.views import _date_param

from .models import Customer, Sale, SaleReturn
from .serializers import (
    CustomerSerializer,
    SaleDetailSerializer,
    SaleReturnDetailSerializer,
    SaleReturnSerializer,
    SaleReturnWriteSerializer,
    SaleSerializer,
    SaleWriteSerializer,
    VoidSaleSerializer,
    sale_return_with_lines,
)


class CustomerViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Clientes. Cualquier usuario con sesión, porque los vendedores los crean al vender.

    No hay DELETE: se desactivan con is_active = false. Filtros: ?q= (nombre o
    teléfono; las sugerencias de la venta piden ?q=jua&page_size=8) e
    ?include_inactive=true.
    """

    serializer_class = CustomerSerializer
    pagination_class = StandardPagination
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        queryset = Customer.objects.all()
        if self.action != "list":
            return queryset
        if not _flag(self.request, "include_inactive"):
            queryset = queryset.filter(is_active=True)
        text = self.request.query_params.get("q", "").strip()
        if text:
            # Todas las palabras deben estar en el nombre: «perez juan» encuentra a Juan Pérez.
            condition = Q()
            for word in plain_text(text).split():
                condition &= Q(search_name__contains=word)
            queryset = queryset.filter(condition | Q(phone__contains=text))
        return queryset


class SaleViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Ventas de mostrador. Cualquier usuario con sesión vende y consulta; el costo solo lo ve el dueño.

    POST confirma la venta pagada completa: 201 si es nueva, 200 si la
    idempotency_key ya se había usado (reintento) con la venta de entonces.
    No se editan ni se borran: el dueño las anula con POST /sales/{id}/void y
    las devoluciones se registran con POST /sales/{id}/returns.
    Filtros del listado: ?number=, ?customer=, ?mechanic=, ?voided=true|false, ?date_from=
    y ?date_to= (día de la venta, ambos incluidos).
    """

    pagination_class = StandardPagination

    def get_permissions(self):
        if self.action == "void":
            return [IsOwner()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return SaleWriteSerializer
        if self.action == "void":
            return VoidSaleSerializer
        if self.action == "returns":
            return SaleReturnWriteSerializer
        if self.action == "list":
            return SaleSerializer
        return SaleDetailSerializer

    def get_queryset(self):
        queryset = Sale.objects.select_related("customer", "created_by", "voided_by")
        if self.action != "list":
            return queryset.prefetch_related(
                "items__product", "services__service_type", "services__mechanic", "services__return_line", "payments",
            )

        queryset = queryset.prefetch_related("items", "services")
        number = _id_param(self.request, "number")
        if number:
            queryset = queryset.filter(number=number)
        customer = _id_param(self.request, "customer")
        if customer:
            queryset = queryset.filter(customer_id=customer)
        mechanic = _id_param(self.request, "mechanic")
        if mechanic:
            queryset = queryset.filter(services__mechanic_id=mechanic).distinct()
        voided = self.request.query_params.get("voided")
        if voided:
            queryset = queryset.filter(voided_at__isnull=not _flag(self.request, "voided"))
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED if serializer.created else status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        """Anula la venta con su motivo y responde la venta anulada."""
        serializer = self.get_serializer(self.get_object(), data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def returns(self, request, pk=None):
        """Registra una devolución: 201 si es nueva, 200 si la idempotency_key ya se había usado."""
        context = {**self.get_serializer_context(), "sale": self.get_object()}
        serializer = self.get_serializer(data=request.data, context=context)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED if serializer.created else status.HTTP_200_OK)


class SaleReturnViewSet(viewsets.ReadOnlyModelViewSet):
    """Devoluciones, de la más reciente a la más antigua. Cualquier usuario con sesión consulta.

    Se registran desde la venta (POST /sales/{id}/returns). El descuento al
    mecánico solo se le envía al dueño. Filtros del listado: ?sale=, ?number=,
    ?cause=, ?date_from= y ?date_to= (día de la devolución, ambos incluidos).
    """

    pagination_class = StandardPagination

    def get_serializer_class(self):
        return SaleReturnSerializer if self.action == "list" else SaleReturnDetailSerializer

    def get_queryset(self):
        if self.action != "list":
            return sale_return_with_lines()
        queryset = SaleReturn.objects.select_related("sale__customer", "created_by")
        sale = _id_param(self.request, "sale")
        if sale:
            queryset = queryset.filter(sale_id=sale)
        number = _id_param(self.request, "number")
        if number:
            queryset = queryset.filter(number=number)
        cause = self.request.query_params.get("cause")
        if cause:
            queryset = queryset.filter(cause=cause)
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset
