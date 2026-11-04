from django.db import transaction
from rest_framework import serializers

from apps.catalog.models import Product
from apps.catalog.serializers import ProductWriteSerializer, _is_owner

from .exceptions import InitialCountFinished
from .models import InitialCount, InsufficientStock, InventoryMovement, MovementKind


class MovementProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["id", "code", "name"]


class InventoryMovementSerializer(serializers.ModelSerializer):
    """Línea del kárdex. El costo unitario solo se envía al dueño."""

    product = MovementProductSerializer(read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    OWNER_ONLY_FIELDS = ("unit_cost",)

    class Meta:
        model = InventoryMovement
        fields = [
            "id", "product", "kind", "kind_label", "quantity", "unit_cost", "balance_after",
            "reason", "created_by", "created_at",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _is_owner(self.context):
            for field in self.OWNER_ONLY_FIELDS:
                data.pop(field, None)
        return data


class AdjustmentSerializer(serializers.Serializer):
    """Ajuste físico del dueño: suma o resta unidades y siempre lleva motivo."""

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(help_text="Positivo suma, negativo resta.")
    reason = serializers.CharField(max_length=200)

    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError("La cantidad no puede ser cero.")
        return value

    def validate_reason(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("El ajuste necesita un motivo.")
        return value

    def create(self, validated_data):
        try:
            return InventoryMovement.objects.record(
                kind=MovementKind.ADJUSTMENT, user=self.context["request"].user, **validated_data,
            )
        except InsufficientStock as error:
            raise serializers.ValidationError(
                {"quantity": [f"Solo hay {error.available} unidades: no se pueden restar {error.requested}."]}
            )

    def to_representation(self, instance):
        return InventoryMovementSerializer(instance, context=self.context).data


class WorkshopUseSerializer(serializers.Serializer):
    """Salida de un insumo de taller que se abrió para los servicios. No se le cobra a nadie."""

    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_workshop_supply=True),
        error_messages={"does_not_exist": "Este producto no está marcado como insumo de taller."},
    )
    quantity = serializers.IntegerField(min_value=1, help_text="Unidades que se sacan, por ejemplo 1 envase.")
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_reason(self, value):
        return " ".join(value.split())

    def create(self, validated_data):
        product = validated_data["product"]
        try:
            return InventoryMovement.objects.use_in_workshop(
                product, validated_data["quantity"], self.context["request"].user, reason=validated_data["reason"],
            )
        except InsufficientStock as error:
            if error.available == 0:
                message = f"No hay unidades de {product.code}."
            else:
                message = f"Solo hay {error.available} unidades de {product.code}."
            raise serializers.ValidationError({"quantity": [message]})

    def to_representation(self, instance):
        return InventoryMovementSerializer(instance, context=self.context).data


class InitialCountItemSerializer(ProductWriteSerializer):
    """Un producto del conteo inicial: sus datos y la cantidad contada.

    Producto y movimiento de inventario inicial se guardan juntos. Con cantidad
    0 se crea el producto sin movimiento: existe, pero no hay unidades.
    """

    quantity = serializers.IntegerField(min_value=0, help_text="Unidades contadas.")

    class Meta(ProductWriteSerializer.Meta):
        fields = ProductWriteSerializer.Meta.fields + ["quantity"]

    def validate(self, attrs):
        if not InitialCount.load().is_open:
            raise InitialCountFinished()
        return super().validate(attrs)

    def create(self, validated_data):
        quantity = validated_data.pop("quantity")
        with transaction.atomic():
            product = super().create(validated_data)
            if quantity:
                InventoryMovement.objects.record(
                    product, MovementKind.INITIAL_COUNT, quantity, self.context["request"].user,
                )
        return product


class InitialCountSerializer(serializers.ModelSerializer):
    """Estado del conteo inicial y su avance."""

    is_open = serializers.BooleanField(read_only=True)
    finished_by = serializers.CharField(source="finished_by.username", read_only=True, default=None)
    products_counted = serializers.SerializerMethodField()
    units_counted = serializers.SerializerMethodField()

    class Meta:
        model = InitialCount
        fields = ["is_open", "finished_at", "finished_by", "products_counted", "units_counted"]
        read_only_fields = fields

    def _initial_movements(self):
        return InventoryMovement.objects.filter(kind=MovementKind.INITIAL_COUNT)

    def get_products_counted(self, instance):
        return self._initial_movements().count()

    def get_units_counted(self, instance):
        return sum(self._initial_movements().values_list("quantity", flat=True))
