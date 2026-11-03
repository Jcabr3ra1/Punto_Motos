from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.cash.exceptions import NoOpenCashSession
from apps.cash.models import CashSessionClosed
from apps.catalog.models import Product
from apps.catalog.serializers import _is_owner
from apps.core.models import PaymentMethod
from apps.inventory.exceptions import InitialCountInProgress
from apps.inventory.models import InsufficientStock
from apps.purchases.serializers import clean_text, pesos

from .exceptions import SaleVoided
from .models import (
    Customer, EmptySale, InitialCountOpen, PaymentMismatch, PriceChangeNotAllowed, Sale, SaleAlreadyVoided, SaleItem,
    SalePayment,
)


def line_error(lines, index, field, message):
    """Error en una línea de una lista: [{}, {"quantity": [...]}] llega a la ventana como items.1.quantity."""
    errors = [{} for _ in lines]
    errors[index] = {field: [message]}
    return errors


def stock_message(error):
    if error.available == 0:
        return f"No hay unidades de {error.product.code}."
    return f"Solo hay {error.available} unidades de {error.product.code}."


def payment_mismatch_message(total, paid):
    return f"La venta es de {pesos(total)} y el pago suma {pesos(paid)}: deben ser iguales."


# --- Cliente -----------------------------------------------------------------


class CustomerSerializer(serializers.ModelSerializer):
    """Cliente. El nombre puede repetirse: la ventana sugiere los anteriores para no duplicarlos."""

    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "notes", "is_active"]

    def validate_name(self, value):
        value = clean_text(value)
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_phone(self, value):
        return clean_text(value)

    def validate_notes(self, value):
        return clean_text(value)


class CustomerSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "phone"]


# --- Venta: lectura ----------------------------------------------------------


class SaleProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "code", "name"]


class SaleItemSerializer(serializers.ModelSerializer):
    """Línea de la venta. El costo solo se envía al dueño."""

    product = SaleProductSerializer(read_only=True)
    subtotal = serializers.IntegerField(read_only=True)
    price_changed = serializers.BooleanField(read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            "id", "product", "description", "quantity", "list_price", "unit_price", "price_changed", "subtotal",
            "unit_cost",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _is_owner(self.context):
            data.pop("unit_cost")
        return data


class SalePaymentSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = SalePayment
        fields = ["method", "method_label", "amount"]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    """Venta en la lista."""

    customer = CustomerSummarySerializer(read_only=True)
    items_count = serializers.SerializerMethodField()
    created_by = serializers.CharField(source="created_by.username", read_only=True)
    is_voided = serializers.BooleanField(read_only=True)

    class Meta:
        model = Sale
        fields = ["id", "number", "customer", "total", "items_count", "is_voided", "created_by", "created_at"]
        read_only_fields = fields

    def get_items_count(self, instance):
        return len(instance.items.all())


class SaleDetailSerializer(SaleSerializer):
    """Venta completa, como se imprime en el recibo."""

    items = SaleItemSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    voided_by = serializers.CharField(source="voided_by.username", read_only=True, default=None)

    class Meta(SaleSerializer.Meta):
        fields = SaleSerializer.Meta.fields + ["notes", "items", "payments", "voided_at", "voided_by", "void_reason"]
        read_only_fields = fields


# --- Venta: confirmar --------------------------------------------------------


class SaleItemWriteSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.IntegerField(
        min_value=0, required=False, help_text="Solo el dueño. Vacío: el precio del catálogo.",
    )


class SalePaymentWriteSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount = serializers.IntegerField(min_value=1, help_text="Lo que se aplica a la venta, sin el vuelto.")


class NewCustomerSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_name(self, value):
        value = clean_text(value)
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_phone(self, value):
        return clean_text(value)


class SaleWriteSerializer(serializers.Serializer):
    """Confirma una venta pagada completa.

    El cliente llega como customer (uno existente) o new_customer (se crea con
    la venta). Si idempotency_key ya se usó, se devuelve esa venta sin repetir
    nada y self.created queda en False.
    """

    idempotency_key = serializers.UUIDField(help_text="UUID que genera la ventana para cada venta.")
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.filter(is_active=True), required=False, allow_null=True,
    )
    new_customer = NewCustomerSerializer(required=False, allow_null=True)
    items = SaleItemWriteSerializer(many=True)
    payments = SalePaymentWriteSerializer(many=True)
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
            if item.get("unit_price", product.sale_price) != product.sale_price and not _is_owner(self.context):
                raise serializers.ValidationError(line_error(
                    items, index, "unit_price", "Solo el dueño puede cambiar el precio.",
                ))
        return items

    def validate_payments(self, payments):
        methods = [payment["method"] for payment in payments]
        if len(methods) != len(set(methods)):
            raise serializers.ValidationError("Cada medio de pago va una sola vez: suma los valores.")
        return payments

    def validate_notes(self, value):
        return clean_text(value)

    def validate(self, attrs):
        if bool(attrs.get("customer")) == bool(attrs.get("new_customer")):
            raise serializers.ValidationError({"customer": ["Elige un cliente o escribe el nombre de uno nuevo."]})
        total = sum(item.get("unit_price", item["product"].sale_price) * item["quantity"] for item in attrs["items"])
        paid = sum(payment["amount"] for payment in attrs["payments"])
        if paid != total:
            raise serializers.ValidationError({"payments": [payment_mismatch_message(total, paid)]})
        return attrs

    def create(self, validated_data):
        existing = Sale.objects.filter(idempotency_key=validated_data["idempotency_key"]).first()
        if existing:
            self.created = False
            return existing
        items = validated_data["items"]
        try:
            with transaction.atomic():
                customer = validated_data.get("customer") or Customer.objects.create(**validated_data["new_customer"])
                sale, self.created = Sale.objects.confirm(
                    customer, items, validated_data["payments"], self.context["request"].user,
                    validated_data["idempotency_key"], notes=validated_data["notes"],
                )
        except InitialCountOpen:
            raise InitialCountInProgress()
        except CashSessionClosed:
            raise NoOpenCashSession()
        except InsufficientStock as error:
            index = next(i for i, item in enumerate(items) if item["product"].pk == error.product.pk)
            raise serializers.ValidationError({"items": line_error(items, index, "quantity", stock_message(error))})
        except PriceChangeNotAllowed as error:
            # El precio del catálogo cambió entre la validación y la venta.
            index = next(i for i, item in enumerate(items) if item["product"].pk == error.product.pk)
            raise serializers.ValidationError({"items": line_error(
                items, index, "unit_price", f"El precio de {error.product.code} ahora es {pesos(error.list_price)}.",
            )})
        except PaymentMismatch as error:
            raise serializers.ValidationError({"payments": [payment_mismatch_message(error.total, error.paid)]})
        except EmptySale:
            raise serializers.ValidationError({"items": ["Agrega al menos un producto."]})
        except DjangoValidationError as error:
            raise serializers.ValidationError({"non_field_errors": error.messages})
        return sale

    def to_representation(self, instance):
        instance = Sale.objects.select_related("customer", "created_by").prefetch_related(
            "items__product", "payments",
        ).get(pk=instance.pk)
        return SaleDetailSerializer(instance, context=self.context).data


# --- Venta: anular -----------------------------------------------------------


class VoidSaleSerializer(serializers.Serializer):
    """Anula la venta: devuelve las unidades al inventario y reembolsa los pagos desde la caja abierta."""

    reason = serializers.CharField(max_length=200)

    def validate_reason(self, value):
        value = clean_text(value)
        if not value:
            raise serializers.ValidationError("Indica por qué se anula la venta.")
        return value

    def update(self, instance, validated_data):
        try:
            instance.void(self.context["request"].user, validated_data["reason"])
        except SaleAlreadyVoided:
            raise SaleVoided()
        except CashSessionClosed:
            raise NoOpenCashSession()
        return instance

    def to_representation(self, instance):
        return SaleWriteSerializer(context=self.context).to_representation(instance)
