from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.cash.exceptions import NoOpenCashSession
from apps.cash.models import CashSessionClosed
from apps.catalog.models import Product
from apps.catalog.serializers import NamedModelSerializer
from apps.core.models import PaymentMethod
from apps.inventory.exceptions import InitialCountInProgress
from apps.inventory.models import InsufficientStock
from apps.purchases.serializers import clean_text, pesos
from apps.sales.serializers import SaleProductSerializer, line_error, stock_message

from .models import (
    Consignee, ConsigneePayment, ConsignmentDelivery, ConsignmentItem, ConsignmentReport, ConsignmentReportLine,
    EmptyDelivery, EmptyReport, ExceedsConsigned, InitialCountOpen, Overpayment,
)

# Consignación es un trato del dueño con otro negocio: todas sus vistas son
# solo para el dueño, así que aquí se muestran costos sin filtrar.


# --- Local -------------------------------------------------------------------


class ConsigneeSerializer(NamedModelSerializer):
    duplicate_name_message = "Ya existe un local con ese nombre."

    balance_due = serializers.IntegerField(read_only=True)

    class Meta:
        model = Consignee
        fields = ["id", "name", "tax_id", "phone", "notes", "is_active", "balance_due"]
        validators = []

    def validate_tax_id(self, value):
        return clean_text(value)

    def validate_phone(self, value):
        return clean_text(value)

    def validate_notes(self, value):
        return clean_text(value)


class ConsigneeSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Consignee
        fields = ["id", "name"]


# --- Entrega -----------------------------------------------------------------


class ConsignmentItemSerializer(serializers.ModelSerializer):
    """Producto entregado y cuántas le quedan al local."""

    product = SaleProductSerializer(read_only=True)
    pending_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = ConsignmentItem
        fields = [
            "id", "product", "quantity", "unit_value", "unit_cost", "sold_quantity", "returned_quantity",
            "pending_quantity",
        ]
        read_only_fields = fields


class PendingConsignmentItemSerializer(ConsignmentItemSerializer):
    """Lo que el local todavía tiene, con la entrega de donde salió: es la lista para armar un reporte."""

    delivery = serializers.IntegerField(source="delivery_id", read_only=True)
    delivered_at = serializers.DateTimeField(source="delivery.created_at", read_only=True)

    class Meta(ConsignmentItemSerializer.Meta):
        fields = ["delivery", "delivered_at"] + ConsignmentItemSerializer.Meta.fields
        read_only_fields = fields


class ConsignmentDeliverySerializer(serializers.ModelSerializer):
    consignee = ConsigneeSummarySerializer(read_only=True)
    items = ConsignmentItemSerializer(many=True, read_only=True)
    total_value = serializers.SerializerMethodField(help_text="Unidades entregadas por su valor pactado.")
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ConsignmentDelivery
        fields = ["id", "consignee", "notes", "items", "total_value", "created_by", "created_at"]
        read_only_fields = fields

    def get_total_value(self, instance):
        return sum(item.quantity * item.unit_value for item in instance.items.all())


class ConsignmentItemWriteSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    unit_value = serializers.IntegerField(
        min_value=0, required=False, help_text="Lo que pagará el local por unidad vendida. Vacío: el costo.",
    )


class ConsignmentDeliveryWriteSerializer(serializers.Serializer):
    """Entrega mercancía a un local. Un reintento con la misma clave devuelve la entrega ya hecha."""

    idempotency_key = serializers.UUIDField()
    consignee = serializers.PrimaryKeyRelatedField(queryset=Consignee.objects.filter(is_active=True))
    items = ConsignmentItemWriteSerializer(many=True)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("Agrega al menos un producto.")
        seen = set()
        for index, item in enumerate(items):
            product = item["product"]
            if product.pk in seen:
                raise serializers.ValidationError(line_error(
                    items, index, "product", f"{product.code} está repetido: deja una sola línea con la cantidad total.",
                ))
            seen.add(product.pk)
        return items

    def validate_notes(self, value):
        return clean_text(value)

    def create(self, validated_data):
        items = validated_data["items"]
        try:
            delivery, self.created = ConsignmentDelivery.objects.deliver(
                validated_data["consignee"], items, self.context["request"].user,
                validated_data["idempotency_key"], notes=validated_data["notes"],
            )
        except InitialCountOpen:
            raise InitialCountInProgress()
        except InsufficientStock as error:
            index = next(i for i, item in enumerate(items) if item["product"].pk == error.product.pk)
            raise serializers.ValidationError({"items": line_error(items, index, "quantity", stock_message(error))})
        except EmptyDelivery:
            raise serializers.ValidationError({"items": ["Agrega al menos un producto."]})
        except DjangoValidationError as error:
            raise serializers.ValidationError({"non_field_errors": error.messages})
        return delivery

    def to_representation(self, instance):
        instance = ConsignmentDelivery.objects.select_related("consignee", "created_by").prefetch_related(
            "items__product",
        ).get(pk=instance.pk)
        return ConsignmentDeliverySerializer(instance, context=self.context).data


# --- Reporte -----------------------------------------------------------------


class ConsignmentReportLineSerializer(serializers.ModelSerializer):
    item = serializers.IntegerField(source="item_id", read_only=True)
    delivery = serializers.IntegerField(source="item.delivery_id", read_only=True)
    product = SaleProductSerializer(source="item.product", read_only=True)
    unit_value = serializers.IntegerField(source="item.unit_value", read_only=True)
    subtotal = serializers.SerializerMethodField(help_text="Vendidas por el valor pactado.")

    class Meta:
        model = ConsignmentReportLine
        fields = ["item", "delivery", "product", "unit_value", "sold", "returned", "subtotal"]
        read_only_fields = fields

    def get_subtotal(self, instance):
        return instance.sold * instance.item.unit_value


class ConsignmentReportSerializer(serializers.ModelSerializer):
    consignee = ConsigneeSummarySerializer(read_only=True)
    lines = ConsignmentReportLineSerializer(many=True, read_only=True)
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ConsignmentReport
        fields = ["id", "consignee", "total", "notes", "lines", "created_by", "created_at"]
        read_only_fields = fields


class ConsignmentReportLineWriteSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=ConsignmentItem.objects.select_related("delivery", "product"),
        help_text="Línea de una entrega (id de pending-items).",
    )
    sold = serializers.IntegerField(min_value=0, default=0)
    returned = serializers.IntegerField(min_value=0, default=0)


class ConsignmentReportWriteSerializer(serializers.Serializer):
    """Lo que el local vendió (sube su saldo) y lo que devolvió (vuelve al inventario)."""

    consignee = serializers.PrimaryKeyRelatedField(queryset=Consignee.objects.all())
    lines = ConsignmentReportLineWriteSerializer(many=True)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_notes(self, value):
        return clean_text(value)

    def validate(self, attrs):
        lines = attrs["lines"]
        seen = set()
        for index, line in enumerate(lines):
            item = line["item"]
            if item.delivery.consignee_id != attrs["consignee"].pk:
                raise serializers.ValidationError({"lines": line_error(
                    lines, index, "item", "Esta línea es de una entrega a otro local.",
                )})
            if item.pk in seen:
                raise serializers.ValidationError({"lines": line_error(
                    lines, index, "item", f"{item.product.code} está repetido: deja una sola línea.",
                )})
            seen.add(item.pk)
        if not any(line["sold"] or line["returned"] for line in lines):
            raise serializers.ValidationError({"lines": ["Indica al menos una unidad vendida o devuelta."]})
        return attrs

    def create(self, validated_data):
        lines = validated_data["lines"]
        try:
            return ConsignmentReport.objects.record(
                validated_data["consignee"], lines, self.context["request"].user, notes=validated_data["notes"],
            )
        except ExceedsConsigned as error:
            index = next(i for i, line in enumerate(lines) if line["item"].pk == error.item.pk)
            raise serializers.ValidationError({"lines": line_error(
                lines, index, "sold", f"Al local le quedan {error.pending} de {error.item.product.code}.",
            )})
        except EmptyReport:
            raise serializers.ValidationError({"lines": ["Indica al menos una unidad vendida o devuelta."]})

    def to_representation(self, instance):
        instance = ConsignmentReport.objects.select_related("consignee", "created_by").prefetch_related(
            "lines__item__product",
        ).get(pk=instance.pk)
        return ConsignmentReportSerializer(instance, context=self.context).data


# --- Pagos -------------------------------------------------------------------


class ConsigneePaymentSerializer(serializers.ModelSerializer):
    consignee = ConsigneeSummarySerializer(read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = ConsigneePayment
        fields = ["id", "consignee", "amount", "method", "method_label", "notes", "created_by", "created_at"]
        read_only_fields = fields


class ConsigneePaymentWriteSerializer(serializers.Serializer):
    consignee = serializers.PrimaryKeyRelatedField(queryset=Consignee.objects.all())
    amount = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def create(self, validated_data):
        try:
            return ConsigneePayment.objects.record(user=self.context["request"].user, **validated_data)
        except CashSessionClosed:
            raise NoOpenCashSession()
        except Overpayment as error:
            if error.balance_due == 0:
                message = "El local no debe nada: no se puede registrar el pago."
            else:
                message = f"El local debe {pesos(error.balance_due)}: no se pueden pagar {pesos(error.requested)}."
            raise serializers.ValidationError({"amount": [message]})

    def to_representation(self, instance):
        return ConsigneePaymentSerializer(instance, context=self.context).data
