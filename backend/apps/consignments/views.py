from django.db.models import F, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import IsOwner
from apps.catalog.text import plain_text
from apps.catalog.views import _flag, _id_param
from apps.core.pagination import StandardPagination
from apps.inventory.views import _date_param

from .models import Consignee, ConsigneePayment, ConsignmentDelivery, ConsignmentItem, ConsignmentReport
from .serializers import (
    ConsigneePaymentSerializer,
    ConsigneePaymentWriteSerializer,
    ConsigneeSerializer,
    ConsignmentDeliverySerializer,
    ConsignmentDeliveryWriteSerializer,
    ConsignmentReportSerializer,
    ConsignmentReportWriteSerializer,
    PendingConsignmentItemSerializer,
)

# Todo lo de consignación es un trato del dueño con otro negocio: solo él.


def _filter_by_consignee_and_dates(request, queryset):
    consignee = _id_param(request, "consignee")
    if consignee:
        queryset = queryset.filter(consignee_id=consignee)
    date_from = _date_param(request, "date_from")
    if date_from:
        queryset = queryset.filter(created_at__date__gte=date_from)
    date_to = _date_param(request, "date_to")
    if date_to:
        queryset = queryset.filter(created_at__date__lte=date_to)
    return queryset


class ConsigneeViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Locales a los que se deja mercancía en consignación, con lo que deben.

    No hay DELETE: se desactivan con is_active = false. Filtros: ?q= (nombre o
    NIT), ?with_debt=true e ?include_inactive=true.
    GET /consignees/{id}/pending-items: lo que el local todavía tiene.
    """

    permission_classes = [IsOwner]
    serializer_class = ConsigneeSerializer
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        queryset = Consignee.objects.all()
        if self.action != "list":
            return queryset
        if not _flag(self.request, "include_inactive"):
            queryset = queryset.filter(is_active=True)
        text = self.request.query_params.get("q", "").strip()
        if text:
            queryset = queryset.filter(Q(search_name__contains=plain_text(text)) | Q(tax_id__icontains=text))
        if _flag(self.request, "with_debt"):
            queryset = queryset.filter(balance_due__gt=0)
        return queryset

    @action(detail=True, methods=["get"], url_path="pending-items")
    def pending_items(self, request, pk=None):
        """Líneas de entrega con unidades que el local no ha vendido ni devuelto, de la más antigua a la más nueva."""
        consignee = self.get_object()
        items = (
            ConsignmentItem.objects.filter(delivery__consignee=consignee)
            .filter(quantity__gt=F("sold_quantity") + F("returned_quantity"))
            .select_related("delivery", "product")
            .order_by("delivery__created_at", "id")
        )
        return Response(PendingConsignmentItemSerializer(items, many=True).data)


class ConsignmentDeliveryViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Entregas en consignación. No se editan ni se borran.

    POST responde 201 si es nueva y 200 si la idempotency_key ya se había usado.
    Filtros: ?consignee=, ?date_from= y ?date_to=.
    """

    permission_classes = [IsOwner]
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "create":
            return ConsignmentDeliveryWriteSerializer
        return ConsignmentDeliverySerializer

    def get_queryset(self):
        queryset = ConsignmentDelivery.objects.select_related("consignee", "created_by").prefetch_related(
            "items__product",
        )
        if self.action != "list":
            return queryset
        return _filter_by_consignee_and_dates(self.request, queryset)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED if serializer.created else status.HTTP_200_OK)


class ConsignmentReportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Reportes de lo que vendió y devolvió cada local. No se editan ni se borran.

    Filtros: ?consignee=, ?date_from= y ?date_to=.
    """

    permission_classes = [IsOwner]
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "create":
            return ConsignmentReportWriteSerializer
        return ConsignmentReportSerializer

    def get_queryset(self):
        queryset = ConsignmentReport.objects.select_related("consignee", "created_by").prefetch_related(
            "lines__item__product",
        )
        if self.action != "list":
            return queryset
        return _filter_by_consignee_and_dates(self.request, queryset)


class ConsigneePaymentViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Pagos de los locales. No se editan ni se borran. Filtros: ?consignee=, ?date_from= y ?date_to=."""

    permission_classes = [IsOwner]
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "create":
            return ConsigneePaymentWriteSerializer
        return ConsigneePaymentSerializer

    def get_queryset(self):
        queryset = ConsigneePayment.objects.select_related("consignee", "created_by")
        if self.action != "list":
            return queryset
        return _filter_by_consignee_and_dates(self.request, queryset)
