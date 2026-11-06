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
from apps.workshop.models import Mechanic, ServiceType
from apps.workshop.serializers import MechanicSummarySerializer, ServiceTypeSummarySerializer

from .exceptions import SaleSettled, SaleVoided, SaleWithReturns
from .models import (
    BadServiceOwnerOnly, Customer, EmptyReturn, EmptySale, InitialCountOpen, LaborPriceChangeNotAllowed,
    PaymentMismatch, PriceChangeNotAllowed, RefundMismatch, ReturnCause, ReturnCondition, ReturnExceedsSold, Sale,
    SaleAlreadyVoided, SaleHasReturns, SaleHasSettledServices, SaleItem, SalePayment, SaleReturn, SaleReturnItem,
    SaleReturnRefund, SaleReturnService, SaleService, ServiceAlreadyReturned, normalize_plate,
)

EMPTY_SALE_MESSAGE = "Agrega al menos un producto o un servicio."
EMPTY_RETURN_MESSAGE = "Indica al menos un producto o un servicio para devolver."


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


def return_exceeds_message(error):
    if error.available == 0:
        return f"Ya se devolvieron todas las unidades de {error.item.description}."
    return f"Solo quedan {error.available} por devolver de {error.item.description}."


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
            "id", "product", "description", "quantity", "returned_quantity", "list_price", "unit_price",
            "price_changed", "subtotal", "unit_cost",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _is_owner(self.context):
            data.pop("unit_cost")
        return data


class SaleServiceSerializer(serializers.ModelSerializer):
    """Servicio del taller en la venta, con su mecánico."""

    service_type = ServiceTypeSummarySerializer(read_only=True)
    mechanic = MechanicSummarySerializer(read_only=True)
    price_changed = serializers.BooleanField(read_only=True)
    is_returned = serializers.SerializerMethodField()

    class Meta:
        model = SaleService
        fields = [
            "id", "service_type", "mechanic", "plate", "details", "suggested_price", "labor_price", "price_changed",
            "is_returned",
        ]
        read_only_fields = fields

    def get_is_returned(self, instance):
        return hasattr(instance, "return_line")


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
    services_count = serializers.SerializerMethodField()
    created_by = serializers.CharField(source="created_by.username", read_only=True)
    is_voided = serializers.BooleanField(read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id", "number", "customer", "total", "items_count", "services_count", "is_voided", "created_by",
            "created_at",
        ]
        read_only_fields = fields

    def get_items_count(self, instance):
        return len(instance.items.all())

    def get_services_count(self, instance):
        return len(instance.services.all())


class SaleDetailSerializer(SaleSerializer):
    """Venta completa, como se imprime en el recibo."""

    items = SaleItemSerializer(many=True, read_only=True)
    services = SaleServiceSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    voided_by = serializers.CharField(source="voided_by.username", read_only=True, default=None)

    class Meta(SaleSerializer.Meta):
        fields = SaleSerializer.Meta.fields + ["notes", "items", "services", "payments", "voided_at", "voided_by", "void_reason"]
        read_only_fields = fields


# --- Venta: confirmar --------------------------------------------------------


class SaleItemWriteSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.IntegerField(
        min_value=0, required=False, help_text="Solo el dueño. Vacío: el precio del catálogo.",
    )


class SaleServiceWriteSerializer(serializers.Serializer):
    service_type = serializers.PrimaryKeyRelatedField(queryset=ServiceType.objects.filter(is_active=True))
    mechanic = serializers.PrimaryKeyRelatedField(queryset=Mechanic.objects.filter(is_active=True))
    plate = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    details = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    labor_price = serializers.IntegerField(
        min_value=0, required=False, help_text="Solo el dueño. Vacío: el precio sugerido del tipo de servicio.",
    )

    def validate_plate(self, value):
        value = normalize_plate(value)
        if len(value) > 10:
            raise serializers.ValidationError("La placa tiene máximo 10 caracteres.")
        return value

    def validate_details(self, value):
        return clean_text(value)


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
    items = SaleItemWriteSerializer(many=True, required=False, default=list)
    services = SaleServiceWriteSerializer(many=True, required=False, default=list)
    payments = SalePaymentWriteSerializer(many=True)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_items(self, items):
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

    def validate_services(self, services):
        for index, service in enumerate(services):
            service_type = service["service_type"]
            if service_type.needs_description and not service["details"]:
                raise serializers.ValidationError(line_error(
                    services, index, "details", f"Escribe qué se hizo en el servicio «{service_type.name}».",
                ))
            labor_price = service.get("labor_price", service_type.suggested_price)
            if labor_price != service_type.suggested_price and not _is_owner(self.context):
                raise serializers.ValidationError(line_error(
                    services, index, "labor_price", "Solo el dueño puede cambiar el valor del servicio.",
                ))
        return services

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
        if not attrs["items"] and not attrs["services"]:
            raise serializers.ValidationError({"items": [EMPTY_SALE_MESSAGE]})
        total = sum(item.get("unit_price", item["product"].sale_price) * item["quantity"] for item in attrs["items"])
        total += sum(
            service.get("labor_price", service["service_type"].suggested_price) for service in attrs["services"]
        )
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
        services = validated_data["services"]
        try:
            with transaction.atomic():
                customer = validated_data.get("customer") or Customer.objects.create(**validated_data["new_customer"])
                sale, self.created = Sale.objects.confirm(
                    customer, items, validated_data["payments"], self.context["request"].user,
                    validated_data["idempotency_key"], notes=validated_data["notes"], services=services,
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
        except LaborPriceChangeNotAllowed as error:
            # El precio sugerido cambió entre la validación y la venta.
            index = next(i for i, service in enumerate(services) if service["service_type"].pk == error.service_type.pk)
            raise serializers.ValidationError({"services": line_error(
                services, index, "labor_price",
                f"El valor sugerido de «{error.service_type.name}» ahora es {pesos(error.suggested_price)}.",
            )})
        except PaymentMismatch as error:
            raise serializers.ValidationError({"payments": [payment_mismatch_message(error.total, error.paid)]})
        except EmptySale:
            raise serializers.ValidationError({"items": [EMPTY_SALE_MESSAGE]})
        except DjangoValidationError as error:
            raise serializers.ValidationError({"non_field_errors": error.messages})
        return sale

    def to_representation(self, instance):
        instance = Sale.objects.select_related("customer", "created_by").prefetch_related(
            "items__product", "services__service_type", "services__mechanic", "services__return_line", "payments",
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
        except SaleHasSettledServices:
            raise SaleSettled()
        except SaleHasReturns:
            raise SaleWithReturns()
        except CashSessionClosed:
            raise NoOpenCashSession()
        return instance

    def to_representation(self, instance):
        return SaleWriteSerializer(context=self.context).to_representation(instance)


# --- Devolución: lectura -----------------------------------------------------


class SaleReturnItemSerializer(serializers.ModelSerializer):
    """Producto devuelto. El valor es el que se cobró en la venta."""

    sale_item = serializers.IntegerField(source="sale_item_id", read_only=True)
    product = SaleProductSerializer(source="sale_item.product", read_only=True)
    description = serializers.CharField(source="sale_item.description", read_only=True)
    unit_price = serializers.IntegerField(source="sale_item.unit_price", read_only=True)
    condition_label = serializers.CharField(source="get_condition_display", read_only=True)
    subtotal = serializers.IntegerField(read_only=True)

    class Meta:
        model = SaleReturnItem
        fields = [
            "id", "sale_item", "product", "description", "quantity", "condition", "condition_label", "unit_price",
            "subtotal",
        ]
        read_only_fields = fields


class SaleReturnServiceSerializer(serializers.ModelSerializer):
    """Servicio devuelto, con el mecánico que lo hizo."""

    sale_service = serializers.IntegerField(source="sale_service_id", read_only=True)
    service_type = ServiceTypeSummarySerializer(source="sale_service.service_type", read_only=True)
    mechanic = MechanicSummarySerializer(source="sale_service.mechanic", read_only=True)
    plate = serializers.CharField(source="sale_service.plate", read_only=True)
    details = serializers.CharField(source="sale_service.details", read_only=True)
    labor_price = serializers.IntegerField(source="sale_service.labor_price", read_only=True)

    class Meta:
        model = SaleReturnService
        fields = ["id", "sale_service", "service_type", "mechanic", "plate", "details", "labor_price"]
        read_only_fields = fields


class SaleReturnRefundSerializer(serializers.ModelSerializer):
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = SaleReturnRefund
        fields = ["method", "method_label", "amount"]
        read_only_fields = fields


class SaleReturnDeductionSerializer(serializers.Serializer):
    """Lo que se le descuenta al mecánico y cuánto falta por descontar hoy."""

    mechanic = MechanicSummarySerializer()
    amount = serializers.IntegerField()
    applied_amount = serializers.IntegerField()
    pending_amount = serializers.IntegerField()


class SaleReturnSerializer(serializers.ModelSerializer):
    """Devolución en la lista."""

    sale_number = serializers.IntegerField(source="sale.number", read_only=True)
    customer = CustomerSummarySerializer(source="sale.customer", read_only=True)
    cause_label = serializers.CharField(source="get_cause_display", read_only=True)
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = SaleReturn
        fields = [
            "id", "number", "sale", "sale_number", "customer", "cause", "cause_label", "reason", "total",
            "created_by", "created_at",
        ]
        read_only_fields = fields


class SaleReturnDetailSerializer(SaleReturnSerializer):
    """Devolución completa. El descuento al mecánico es dato de pago: solo se envía al dueño."""

    items = SaleReturnItemSerializer(many=True, read_only=True)
    services = SaleReturnServiceSerializer(many=True, read_only=True)
    refunds = SaleReturnRefundSerializer(many=True, read_only=True)
    mechanic_deduction = SaleReturnDeductionSerializer(read_only=True, allow_null=True)

    class Meta(SaleReturnSerializer.Meta):
        fields = SaleReturnSerializer.Meta.fields + ["items", "services", "refunds", "mechanic_deduction"]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _is_owner(self.context):
            data.pop("mechanic_deduction")
        return data


def sale_return_with_lines():
    """Consulta con todo lo que lee SaleReturnDetailSerializer."""
    return SaleReturn.objects.select_related(
        "sale__customer", "created_by", "mechanic_deduction__mechanic",
    ).prefetch_related(
        "items__sale_item__product", "services__sale_service__service_type", "services__sale_service__mechanic",
        "refunds",
    )


# --- Devolución: registrar ---------------------------------------------------


class SaleReturnItemWriteSerializer(serializers.Serializer):
    sale_item = serializers.PrimaryKeyRelatedField(queryset=SaleItem.objects.select_related("product"))
    quantity = serializers.IntegerField(min_value=1)
    # Obligatorio: por omisión una unidad dañada entraría al inventario como vendible.
    condition = serializers.ChoiceField(choices=ReturnCondition.choices)


class SaleReturnRefundWriteSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    amount = serializers.IntegerField(min_value=1)


class SaleReturnWriteSerializer(serializers.Serializer):
    """Registra una devolución de la venta que llega en context["sale"].

    Las reglas viven en SaleReturn.objects.register(); aquí se traducen sus
    errores. Si idempotency_key ya se usó, se devuelve esa devolución sin
    repetir nada y self.created queda en False.
    """

    idempotency_key = serializers.UUIDField(help_text="UUID que genera la ventana para cada devolución.")
    cause = serializers.ChoiceField(choices=ReturnCause.choices)
    reason = serializers.CharField(max_length=150)
    items = SaleReturnItemWriteSerializer(many=True, required=False, default=list)
    services = serializers.PrimaryKeyRelatedField(
        queryset=SaleService.objects.select_related("service_type", "mechanic"), many=True, required=False,
        default=list,
    )
    refunds = SaleReturnRefundWriteSerializer(many=True)

    def validate_reason(self, value):
        value = clean_text(value)
        if not value:
            raise serializers.ValidationError("Indica el motivo de la devolución.")
        return value

    def validate_refunds(self, refunds):
        methods = [refund["method"] for refund in refunds]
        if len(methods) != len(set(methods)):
            raise serializers.ValidationError("Cada medio de pago va una sola vez: suma los valores.")
        return refunds

    def create(self, validated_data):
        items = validated_data["items"]
        try:
            sale_return, self.created = SaleReturn.objects.register(
                self.context["sale"], validated_data["cause"], validated_data["reason"], self.context["request"].user,
                validated_data["idempotency_key"], items=items, services=validated_data["services"],
                refunds=validated_data["refunds"],
            )
        except BadServiceOwnerOnly:
            raise serializers.ValidationError({"cause": ["Solo el dueño puede registrar una devolución por mal servicio."]})
        except SaleAlreadyVoided:
            raise SaleVoided()
        except CashSessionClosed:
            raise NoOpenCashSession()
        except EmptyReturn:
            raise serializers.ValidationError({"items": [EMPTY_RETURN_MESSAGE]})
        except ReturnExceedsSold as error:
            index = next(i for i, item in enumerate(items) if item["sale_item"].pk == error.item.pk)
            raise serializers.ValidationError({"items": line_error(
                items, index, "quantity", return_exceeds_message(error),
            )})
        except ServiceAlreadyReturned as error:
            raise serializers.ValidationError({"services": [
                f"El servicio «{error.service.service_type.name}» ya se devolvió.",
            ]})
        except RefundMismatch as error:
            raise serializers.ValidationError({"refunds": [
                f"La devolución es de {pesos(error.total)} y el reembolso suma {pesos(error.refunded)}: deben ser iguales.",
            ]})
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict)
        return sale_return

    def to_representation(self, instance):
        return SaleReturnDetailSerializer(sale_return_with_lines().get(pk=instance.pk), context=self.context).data
