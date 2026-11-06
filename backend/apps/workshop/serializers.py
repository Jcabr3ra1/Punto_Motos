from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from apps.cash.exceptions import NoOpenCashSession
from apps.cash.models import CashSessionClosed
from apps.catalog.serializers import NamedModelSerializer, _is_owner
from apps.core.models import PaymentMethod
from apps.purchases.serializers import clean_text

from .exceptions import NothingPending
from .models import Mechanic, MechanicDeduction, MechanicSettlement, NothingToSettle, ServiceType

# Lo que lee MechanicSettlementDetailSerializer.
SETTLEMENT_DETAIL_PREFETCH = [
    "services__service_type",
    "services__sale__customer",
    "deduction_applications__deduction__sale_return__sale__customer",
    "deduction_applications__deduction__sale_return__services__sale_service__service_type",
]


class ServiceTypeSerializer(NamedModelSerializer):
    """Tipo de servicio. Todos lo consultan; solo el dueño lo crea y lo edita."""

    duplicate_name_message = "Ya existe un tipo de servicio con ese nombre."

    code = serializers.IntegerField(min_value=1, max_value=99999, help_text="Número corto para el buscador, como 101.")
    suggested_price = serializers.IntegerField(min_value=0, help_text="Mano de obra sugerida en pesos enteros.")

    class Meta:
        model = ServiceType
        fields = ["id", "code", "name", "suggested_price", "needs_description", "is_active"]
        # La unicidad se valida a mano para dar un mensaje claro.
        validators = []

    def validate_code(self, value):
        same = ServiceType.objects.filter(code=value)
        if self.instance:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError("Ya existe un tipo de servicio con ese código.")
        return value


class MechanicSerializer(NamedModelSerializer):
    """Mecánico. Todos lo consultan para elegirlo en la venta; solo el dueño lo crea y lo edita."""

    duplicate_name_message = "Ya existe un mecánico con ese nombre."

    labor_percentage = serializers.IntegerField(
        min_value=0, max_value=100, required=False, allow_null=True,
        help_text="Vacío (null): usa el porcentaje general del negocio.",
    )
    effective_percentage = serializers.IntegerField(read_only=True)

    class Meta:
        model = Mechanic
        fields = ["id", "name", "phone", "labor_percentage", "effective_percentage", "is_active"]
        validators = []

    def validate_phone(self, value):
        return clean_text(value)

    def to_representation(self, instance):
        # El porcentaje es dato de pago: el vendedor solo ve el nombre para elegirlo.
        data = super().to_representation(instance)
        if not _is_owner(self.context):
            data.pop("labor_percentage")
            data.pop("effective_percentage")
        return data


class ServiceTypeSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceType
        fields = ["id", "code", "name"]


class MechanicSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Mechanic
        fields = ["id", "name"]


# --- Liquidación diaria ------------------------------------------------------


class SettlementPreviewSerializer(serializers.Serializer):
    """Lo que se le debe a un mecánico por los servicios sin pagar de un día. Se calcula, no se guarda."""

    mechanic = MechanicSummarySerializer()
    services_count = serializers.IntegerField()
    labor_total = serializers.IntegerField()
    percentage = serializers.IntegerField()
    share = serializers.IntegerField(help_text="Su parte de la mano de obra, antes de descuentos.")
    deductions_total = serializers.IntegerField(help_text="Lo que se le descontará en este pago.")
    amount = serializers.IntegerField(help_text="Lo que recibe: share menos deductions_total.")


class SettledServiceSerializer(serializers.Serializer):
    """Servicio pagado en la liquidación, con la venta de donde salió (para la hoja impresa)."""

    id = serializers.IntegerField()
    sale_id = serializers.IntegerField()
    sale_number = serializers.IntegerField(source="sale.number")
    customer = serializers.CharField(source="sale.customer.name")
    service_type = ServiceTypeSummarySerializer()
    plate = serializers.CharField()
    details = serializers.CharField()
    labor_price = serializers.IntegerField()


class DeductedServiceSerializer(serializers.Serializer):
    """Servicio devuelto que originó un descuento."""

    service_type = ServiceTypeSummarySerializer(source="sale_service.service_type")
    plate = serializers.CharField(source="sale_service.plate")
    details = serializers.CharField(source="sale_service.details")
    labor_price = serializers.IntegerField(source="sale_service.labor_price")


class AppliedDeductionSerializer(serializers.Serializer):
    """Descuento aplicado en la liquidación, con lo que el mecánico debe ver en su hoja."""

    amount = serializers.IntegerField(help_text="Lo descontado en esta liquidación.")
    deduction_total = serializers.IntegerField(source="deduction.amount")
    pending_amount = serializers.IntegerField(source="deduction.pending_amount", help_text="Lo que falta por descontar hoy.")
    sale_return_number = serializers.IntegerField(source="deduction.sale_return.number")
    sale_number = serializers.IntegerField(source="deduction.sale_return.sale.number")
    customer = serializers.CharField(source="deduction.sale_return.sale.customer.name")
    reason = serializers.CharField(source="deduction.sale_return.reason")
    services = DeductedServiceSerializer(source="deduction.sale_return.services", many=True)


class MechanicDeductionSerializer(serializers.ModelSerializer):
    """Descuento a un mecánico por mal servicio, con su saldo de hoy."""

    mechanic = MechanicSummarySerializer(read_only=True)
    applied_amount = serializers.IntegerField(read_only=True)
    pending_amount = serializers.IntegerField(read_only=True)
    sale_return_number = serializers.IntegerField(source="sale_return.number", read_only=True)
    sale_number = serializers.IntegerField(source="sale_return.sale.number", read_only=True)
    customer = serializers.CharField(source="sale_return.sale.customer.name", read_only=True)
    reason = serializers.CharField(source="sale_return.reason", read_only=True)
    services = DeductedServiceSerializer(source="sale_return.services", many=True, read_only=True)

    class Meta:
        model = MechanicDeduction
        fields = [
            "id", "mechanic", "amount", "applied_amount", "pending_amount", "sale_return", "sale_return_number",
            "sale_number", "customer", "reason", "services", "created_at",
        ]
        read_only_fields = fields


class MechanicSettlementSerializer(serializers.ModelSerializer):
    """Liquidación en la lista."""

    mechanic = MechanicSummarySerializer(read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    services_count = serializers.SerializerMethodField()
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = MechanicSettlement
        fields = [
            "id", "mechanic", "date", "labor_total", "percentage", "deductions_total", "amount", "method",
            "method_label", "services_count", "created_by", "created_at",
        ]
        read_only_fields = fields

    def get_services_count(self, instance):
        return len(instance.services.all())


class MechanicSettlementDetailSerializer(MechanicSettlementSerializer):
    """Liquidación completa, como se imprime para el mecánico."""

    services = SettledServiceSerializer(many=True, read_only=True)
    deductions = AppliedDeductionSerializer(source="deduction_applications", many=True, read_only=True)

    class Meta(MechanicSettlementSerializer.Meta):
        fields = MechanicSettlementSerializer.Meta.fields + ["services", "deductions"]
        read_only_fields = fields


class SettleSerializer(serializers.Serializer):
    """Paga al mecánico su parte de la mano de obra de los servicios sin pagar del día.

    El mecánico puede estar desactivado: lo que se le debe se le paga igual.
    """

    mechanic = serializers.PrimaryKeyRelatedField(queryset=Mechanic.objects.all())
    date = serializers.DateField(required=False, help_text="Día trabajado. Vacío: hoy.")
    method = serializers.ChoiceField(choices=PaymentMethod.choices, default=PaymentMethod.CASH)

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("No se puede liquidar un día que no ha llegado.")
        return value

    def create(self, validated_data):
        try:
            return MechanicSettlement.objects.settle(
                validated_data["mechanic"], validated_data.get("date") or timezone.localdate(),
                self.context["request"].user, method=validated_data["method"],
            )
        except NothingToSettle:
            raise NothingPending()
        except CashSessionClosed:
            raise NoOpenCashSession()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict)

    def to_representation(self, instance):
        return MechanicSettlementDetailSerializer(settlement_with_services(instance.pk), context=self.context).data


def settlement_with_services(pk):
    return MechanicSettlement.objects.select_related("mechanic", "created_by").prefetch_related(
        *SETTLEMENT_DETAIL_PREFETCH,
    ).get(pk=pk)
