from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum
from rest_framework import serializers

from apps.core.models import PaymentMethod
from apps.purchases.serializers import clean_text, pesos

from .exceptions import NoOpenCashSession
from .models import (
    MANUAL_KINDS, CashDifferenceUnexplained, CashMovement, CashMovementKind, CashSession, CashSessionAlreadyOpen,
    CashSessionClosed,
)


def session_summary(session):
    """Totales de la caja por tipo y medio, en el orden de CashMovementKind."""
    rows = session.movements.values("kind", "method").annotate(total=Sum("amount"))
    totals = {(row["kind"], row["method"]): row["total"] for row in rows}
    by_kind = [
        {
            "kind": kind.value, "kind_label": kind.label,
            "cash": totals.get((kind.value, PaymentMethod.CASH), 0),
            "transfer": totals.get((kind.value, PaymentMethod.TRANSFER), 0),
        }
        for kind in CashMovementKind
        if (kind.value, PaymentMethod.CASH) in totals or (kind.value, PaymentMethod.TRANSFER) in totals
    ]
    return {
        "by_kind": by_kind,
        "cash_total": sum(row["cash"] for row in by_kind),
        "transfer_total": sum(row["transfer"] for row in by_kind),
    }


class CashSessionSerializer(serializers.ModelSerializer):
    """Caja con su resumen. expected_cash es el de ahora si está abierta y el del cierre si no."""

    is_open = serializers.BooleanField(read_only=True)
    expected_cash = serializers.IntegerField(source="current_expected_cash", read_only=True)
    difference = serializers.IntegerField(read_only=True, allow_null=True)
    opened_by = serializers.CharField(source="opened_by.username", read_only=True)
    closed_by = serializers.CharField(source="closed_by.username", read_only=True, default=None)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = CashSession
        fields = [
            "id", "is_open", "opening_cash", "expected_cash", "counted_cash", "difference", "closing_notes",
            "opened_by", "opened_at", "closed_by", "closed_at", "summary",
        ]
        read_only_fields = fields

    def get_summary(self, instance):
        return session_summary(instance)


class CashSessionListSerializer(CashSessionSerializer):
    """Caja en el historial, sin el resumen por tipo."""

    class Meta(CashSessionSerializer.Meta):
        fields = [field for field in CashSessionSerializer.Meta.fields if field != "summary"]
        read_only_fields = fields


class OpenCashSessionSerializer(serializers.Serializer):
    opening_cash = serializers.IntegerField(min_value=0, help_text="Efectivo que hay en el cajón al abrir.")

    def create(self, validated_data):
        try:
            return CashSession.objects.open(validated_data["opening_cash"], self.context["request"].user)
        except CashSessionAlreadyOpen:
            raise serializers.ValidationError({"non_field_errors": ["Ya hay una caja abierta: ciérrala primero."]})

    def to_representation(self, instance):
        return CashSessionSerializer(instance, context=self.context).data


class CloseCashSessionSerializer(serializers.Serializer):
    """Cierra la caja con el efectivo contado. Si no cuadra con el esperado, notes es obligatorio."""

    counted_cash = serializers.IntegerField(min_value=0)
    notes = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")

    def update(self, instance, validated_data):
        try:
            instance.close(validated_data["counted_cash"], self.context["request"].user, notes=validated_data["notes"])
        except CashSessionClosed:
            raise NoOpenCashSession("Esta caja ya se cerró.")
        except CashDifferenceUnexplained:
            difference = validated_data["counted_cash"] - instance.current_expected_cash
            word = "Sobran" if difference > 0 else "Faltan"
            raise serializers.ValidationError({"notes": [
                f"{word} {pesos(abs(difference))} frente a lo esperado: explica la diferencia.",
            ]})
        return instance

    def to_representation(self, instance):
        return CashSessionSerializer(instance, context=self.context).data


class CashMovementSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    sale_number = serializers.IntegerField(source="sale.number", read_only=True, default=None)
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = CashMovement
        fields = [
            "id", "session", "kind", "kind_label", "method", "method_label", "amount", "reason", "sale",
            "sale_number", "sale_return", "supplier_payment", "consignee_payment", "mechanic_settlement", "created_by",
            "created_at",
        ]
        read_only_fields = fields


class SpendSerializer(serializers.Serializer):
    """Gasto o retiro del dueño. amount llega positivo; el movimiento queda negativo."""

    kind = serializers.ChoiceField(choices=[(kind.value, kind.label) for kind in MANUAL_KINDS])
    amount = serializers.IntegerField(min_value=1)
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    reason = serializers.CharField(max_length=200)

    def validate_reason(self, value):
        value = clean_text(value)
        if not value:
            raise serializers.ValidationError("Indica en qué se usó el dinero.")
        return value

    def create(self, validated_data):
        try:
            return CashMovement.objects.spend(user=self.context["request"].user, **validated_data)
        except CashSessionClosed:
            raise NoOpenCashSession()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict)

    def to_representation(self, instance):
        return CashMovementSerializer(instance, context=self.context).data
