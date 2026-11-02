from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import PriceChange, Product
from apps.catalog.serializers import NamedModelSerializer

from .exceptions import PurchaseReceived
from .models import (
    EmptyPurchase, Overpayment, PaymentAllocation, PaymentMethod, Purchase, PurchaseItem, PurchaseNotDraft,
    PurchaseNotReceived, PurchaseStatus, Supplier, SupplierPayment,
)


def pesos(value):
    """25000 -> «$25.000», como se escribe el dinero en Colombia."""
    return f"${value:,}".replace(",", ".")


def overpayment_message(error):
    if error.balance_due == 0:
        return "No hay saldo pendiente: no se puede abonar."
    return f"Se deben {pesos(error.balance_due)}: no se pueden abonar {pesos(error.requested)}."


def clean_text(value):
    return " ".join(value.split())


def validate_not_future(value):
    if value > timezone.localdate():
        raise serializers.ValidationError("La fecha de pago no puede ser futura.")
    return value


# --- Proveedor ---------------------------------------------------------------


class SupplierSerializer(NamedModelSerializer):
    """Proveedor con lo que se le debe en total.

    Las vistas anotan la deuda como due para no consultarla por cada fila.
    """

    duplicate_name_message = "Ya existe un proveedor con ese nombre."

    balance_due = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = ["id", "name", "tax_id", "phone", "notes", "is_active", "balance_due"]
        validators = []

    def get_balance_due(self, instance):
        due = getattr(instance, "due", None)
        return instance.balance_due if due is None else due

    def validate_tax_id(self, value):
        return clean_text(value)

    def validate_phone(self, value):
        return clean_text(value)

    def validate_notes(self, value):
        return clean_text(value)


class SupplierSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name"]


# --- Compra: lectura ---------------------------------------------------------


class PurchaseProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "code", "name"]


class PurchaseItemSerializer(serializers.ModelSerializer):
    product = PurchaseProductSerializer(read_only=True)
    subtotal = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseItem
        fields = ["id", "product", "quantity", "unit_cost", "subtotal"]
        read_only_fields = fields


class PurchaseAllocationSerializer(serializers.ModelSerializer):
    """Abono visto desde la compra: cuánto de ese abono se aplicó aquí."""

    payment = serializers.IntegerField(source="payment_id", read_only=True)
    paid_on = serializers.DateField(source="payment.paid_on", read_only=True)
    method = serializers.CharField(source="payment.method", read_only=True)
    method_label = serializers.CharField(source="payment.get_method_display", read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ["payment", "paid_on", "method", "method_label", "amount"]
        read_only_fields = fields


class PurchaseSerializer(serializers.ModelSerializer):
    """Compra en la lista. En borrador, total es la suma de las líneas y no hay estado de pago."""

    supplier = SupplierSummarySerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    total = serializers.SerializerMethodField()
    balance_due = serializers.IntegerField(read_only=True)
    payment_status = serializers.CharField(read_only=True, allow_null=True)
    items_count = serializers.SerializerMethodField()
    created_by = serializers.CharField(source="created_by.username", read_only=True)
    received_by = serializers.CharField(source="received_by.username", read_only=True, default=None)

    class Meta:
        model = Purchase
        fields = [
            "id", "supplier", "document_number", "status", "status_label", "total", "paid_amount", "balance_due",
            "payment_status", "items_count", "created_by", "created_at", "received_by", "received_at",
        ]
        read_only_fields = fields

    def get_total(self, instance):
        return instance.items_total if instance.is_draft else instance.total

    def get_items_count(self, instance):
        return len(instance.items.all())


class PurchaseDetailSerializer(PurchaseSerializer):
    """Compra completa: líneas y abonos aplicados."""

    items = PurchaseItemSerializer(many=True, read_only=True)
    allocations = PurchaseAllocationSerializer(many=True, read_only=True)

    class Meta(PurchaseSerializer.Meta):
        fields = PurchaseSerializer.Meta.fields + ["notes", "items", "allocations"]
        read_only_fields = fields


# --- Compra: borrador --------------------------------------------------------


class PurchaseItemWriteSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.IntegerField(min_value=0, help_text="Pesos por unidad; 0 si el proveedor la regala.")

    class Meta:
        model = PurchaseItem
        fields = ["product", "quantity", "unit_cost"]


class PurchaseWriteSerializer(serializers.ModelSerializer):
    """Crea o edita una compra en borrador. Las líneas enviadas reemplazan todas las anteriores."""

    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.filter(is_active=True))
    items = PurchaseItemWriteSerializer(many=True, required=False)

    DUPLICATE_DOCUMENT = "Ya hay una compra de este proveedor con ese documento."

    class Meta:
        model = Purchase
        fields = ["supplier", "document_number", "notes", "items"]
        validators = []

    def validate_document_number(self, value):
        return clean_text(value)

    def validate_notes(self, value):
        return clean_text(value)

    def validate_items(self, items):
        seen = set()
        for item in items:
            product = item["product"]
            if product.pk in seen:
                raise serializers.ValidationError(
                    f"{product.code} está repetido: deja una sola línea con la cantidad total.",
                )
            seen.add(product.pk)
        return items

    def validate(self, attrs):
        if self.instance is not None and not self.instance.is_draft:
            raise PurchaseReceived()
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        document = attrs.get("document_number", getattr(self.instance, "document_number", ""))
        if document:
            same = Purchase.objects.filter(supplier=supplier, document_number__iexact=document)
            if self.instance is not None:
                same = same.exclude(pk=self.instance.pk)
            if same.exists():
                raise serializers.ValidationError({"document_number": [self.DUPLICATE_DOCUMENT]})
        return attrs

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        with transaction.atomic():
            purchase = Purchase.objects.create(created_by=self.context["request"].user, **validated_data)
            self._replace_items(purchase, items)
        return purchase

    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        with transaction.atomic():
            # Otra petición pudo recibirla después de validar: se vuelve a comprobar dentro de la transacción.
            if not Purchase.objects.filter(pk=instance.pk, status=PurchaseStatus.DRAFT).exists():
                raise PurchaseReceived()
            instance = super().update(instance, validated_data)
            if items is not None:
                self._replace_items(instance, items)
        return instance

    def _replace_items(self, purchase, items):
        purchase.items.all().delete()
        PurchaseItem.objects.bulk_create(PurchaseItem(purchase=purchase, **item) for item in items)

    def save(self, **kwargs):
        try:
            return super().save(**kwargs)
        except IntegrityError:
            # Dos peticiones simultáneas con el mismo documento: la base de datos lo impide.
            raise serializers.ValidationError({"document_number": [self.DUPLICATE_DOCUMENT]})

    def to_representation(self, instance):
        instance = Purchase.objects.prefetch_related("items__product", "allocations__payment").get(pk=instance.pk)
        return PurchaseDetailSerializer(instance, context=self.context).data


# --- Compra: recepción -------------------------------------------------------


class InitialPaymentSerializer(serializers.Serializer):
    """Abono que se entrega junto con la mercancía."""

    amount = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    paid_on = serializers.DateField(required=False, validators=[validate_not_future])
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True)


class PriceChangeSerializer(serializers.ModelSerializer):
    product = PurchaseProductSerializer(read_only=True)

    class Meta:
        model = PriceChange
        fields = ["product", "old_price", "new_price"]
        read_only_fields = fields


class ReceivePurchaseSerializer(serializers.Serializer):
    """Recibe la compra en borrador, con un abono opcional. Sin abono queda toda la deuda.

    La respuesta es la compra completa más price_changes: los productos que
    subieron de precio porque subió su costo.
    """

    payment = InitialPaymentSerializer(required=False, allow_null=True)

    def update(self, instance, validated_data):
        try:
            self.price_changes = instance.receive(self.context["request"].user, payment=validated_data.get("payment"))
        except PurchaseNotDraft:
            raise PurchaseReceived()
        except EmptyPurchase:
            raise serializers.ValidationError({"non_field_errors": ["La compra no tiene productos."]})
        except Overpayment as error:
            raise serializers.ValidationError({"payment": {"amount": [overpayment_message(error)]}})
        except DjangoValidationError as error:
            raise serializers.ValidationError({"payment": error.message_dict})
        return instance

    def to_representation(self, instance):
        data = PurchaseWriteSerializer(instance, context=self.context).to_representation(instance)
        data["price_changes"] = PriceChangeSerializer(getattr(self, "price_changes", []), many=True).data
        return data


# --- Abonos ------------------------------------------------------------------


class PaymentAllocationSerializer(serializers.ModelSerializer):
    """Compra a la que se aplicó parte de un abono."""

    purchase = serializers.IntegerField(source="purchase_id", read_only=True)
    document_number = serializers.CharField(source="purchase.document_number", read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ["purchase", "document_number", "amount"]
        read_only_fields = fields


class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier = SupplierSummarySerializer(read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = SupplierPayment
        fields = [
            "id", "supplier", "amount", "method", "method_label", "paid_on", "notes", "allocations",
            "created_by", "created_at",
        ]
        read_only_fields = fields


class SupplierPaymentWriteSerializer(serializers.Serializer):
    """Abono al proveedor. Sin compra, paga primero las compras más antiguas."""

    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    purchase = serializers.PrimaryKeyRelatedField(
        queryset=Purchase.objects.all(), required=False, allow_null=True,
        help_text="Compra a la que se aplica todo el abono. Vacío: las más antiguas primero.",
    )
    amount = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    paid_on = serializers.DateField(required=False, validators=[validate_not_future])
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs):
        purchase = attrs.get("purchase")
        if purchase is not None and purchase.supplier_id != attrs["supplier"].pk:
            raise serializers.ValidationError({"purchase": ["La compra es de otro proveedor."]})
        return attrs

    def create(self, validated_data):
        try:
            return SupplierPayment.objects.record(user=self.context["request"].user, **validated_data)
        except PurchaseNotReceived:
            raise serializers.ValidationError({"purchase": ["La compra todavía es borrador: recíbela antes de abonar."]})
        except Overpayment as error:
            raise serializers.ValidationError({"amount": [overpayment_message(error)]})

    def to_representation(self, instance):
        return SupplierPaymentSerializer(instance, context=self.context).data
