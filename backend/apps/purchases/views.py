from django.db.models import BigIntegerField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import IsOwner
from apps.catalog.text import plain_text
from apps.catalog.views import _flag, _id_param
from apps.core.pagination import StandardPagination
from apps.inventory.views import _date_param

from .exceptions import PurchaseReceived
from .models import PaymentStatus, Purchase, PurchaseNotDraft, PurchaseStatus, Supplier, SupplierPayment
from .serializers import (
    PurchaseDetailSerializer,
    PurchaseSerializer,
    PurchaseWriteSerializer,
    ReceivePurchaseSerializer,
    SupplierPaymentSerializer,
    SupplierPaymentWriteSerializer,
    SupplierSerializer,
)

# Condición de cada estado de pago, igual que Purchase.payment_status.
PAYMENT_STATUS_FILTERS = {
    PaymentStatus.PENDING: Q(paid_amount=0, total__gt=0),
    PaymentStatus.PARTIAL: Q(paid_amount__gt=0, paid_amount__lt=F("total")),
    PaymentStatus.PAID: Q(paid_amount=F("total")),
}


def _choice_list_param(request, name, choices):
    """Lee uno o varios valores separados por comas: ?payment_status=pending,partial."""
    value = request.query_params.get(name)
    if not value:
        return []
    selected = [part.strip() for part in value.split(",") if part.strip()]
    invalid = [part for part in selected if part not in choices]
    if invalid:
        raise ValidationError({name: [f"Usa uno o varios de: {', '.join(choices)}."]})
    return selected


class SupplierViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Proveedores con lo que se les debe. Solo el dueño.

    No hay DELETE: se desactivan con is_active = false. Filtros: ?q= (nombre o
    NIT), ?with_debt=true (solo los que tienen saldo) e ?include_inactive=true.
    """

    permission_classes = [IsOwner]
    serializer_class = SupplierSerializer
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        # La deuda se calcula en la misma consulta para no hacer una por proveedor.
        queryset = Supplier.objects.annotate(
            due=Coalesce(
                Sum(
                    F("purchases__total") - F("purchases__paid_amount"),
                    filter=Q(purchases__status=PurchaseStatus.RECEIVED),
                ),
                Value(0),
                output_field=BigIntegerField(),
            ),
        )
        if self.action != "list":
            return queryset
        if not _flag(self.request, "include_inactive"):
            queryset = queryset.filter(is_active=True)
        text = self.request.query_params.get("q", "").strip()
        if text:
            queryset = queryset.filter(Q(search_name__contains=plain_text(text)) | Q(tax_id__icontains=text))
        if _flag(self.request, "with_debt"):
            queryset = queryset.filter(due__gt=0)
        return queryset


class PurchaseViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Compras. Solo el dueño.

    El borrador se crea, se edita con PATCH y se puede borrar. Al recibirlo
    (POST /purchases/{id}/receive) entra el inventario y desde ahí ya no
    cambia. Filtros del listado: ?supplier=, ?status=, ?payment_status=
    (uno o varios separados por comas), ?date_from= y ?date_to= (día de
    creación, ambos incluidos).
    """

    permission_classes = [IsOwner]
    pagination_class = StandardPagination
    http_method_names = ["get", "post", "patch", "delete"]

    def get_serializer_class(self):
        if self.action in ("create", "partial_update"):
            return PurchaseWriteSerializer
        if self.action == "receive":
            return ReceivePurchaseSerializer
        if self.action == "list":
            return PurchaseSerializer
        return PurchaseDetailSerializer

    def get_queryset(self):
        queryset = Purchase.objects.select_related("supplier", "created_by", "received_by")
        if self.action != "list":
            return queryset.prefetch_related("items__product", "allocations__payment")

        queryset = queryset.prefetch_related("items")
        supplier = _id_param(self.request, "supplier")
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        purchase_status = self.request.query_params.get("status")
        if purchase_status:
            if purchase_status not in PurchaseStatus.values:
                raise ValidationError({"status": [f"Usa uno de: {', '.join(PurchaseStatus.values)}."]})
            queryset = queryset.filter(status=purchase_status)
        payment_statuses = _choice_list_param(self.request, "payment_status", PaymentStatus.values)
        if payment_statuses:
            condition = Q()
            for value in payment_statuses:
                condition |= PAYMENT_STATUS_FILTERS[value]
            # Los borradores no tienen estado de pago.
            queryset = queryset.filter(Q(status=PurchaseStatus.RECEIVED) & condition)
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except PurchaseNotDraft:
            raise PurchaseReceived()

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        """Recibe el borrador con un abono opcional y responde la compra con los precios que subieron."""
        serializer = self.get_serializer(self.get_object(), data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class SupplierPaymentViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Abonos a proveedores. Solo el dueño. No se editan ni se borran.

    Filtros: ?supplier=, ?date_from= y ?date_to= (fecha de pago, ambas incluidas).
    """

    permission_classes = [IsOwner]
    pagination_class = StandardPagination

    def get_serializer_class(self):
        if self.action == "create":
            return SupplierPaymentWriteSerializer
        return SupplierPaymentSerializer

    def get_queryset(self):
        queryset = SupplierPayment.objects.select_related("supplier", "created_by").prefetch_related(
            "allocations__purchase",
        )
        if self.action != "list":
            return queryset
        supplier = _id_param(self.request, "supplier")
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        date_from = _date_param(self.request, "date_from")
        if date_from:
            queryset = queryset.filter(paid_on__gte=date_from)
        date_to = _date_param(self.request, "date_to")
        if date_to:
            queryset = queryset.filter(paid_on__lte=date_to)
        return queryset
