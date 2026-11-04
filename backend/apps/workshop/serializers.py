from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from apps.cash.exceptions import NoOpenCashSession
from apps.cash.models import CashSessionClosed
from apps.catalog.serializers import NamedModelSerializer, _is_owner
from apps.core.models import PaymentMethod
from apps.purchases.serializers import clean_text

from .exceptions import NothingPending
from .models import Mechanic, MechanicSettlement, NothingToSettle, ServiceType


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
    amount = serializers.IntegerField()


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


class MechanicSettlementSerializer(serializers.ModelSerializer):
    """Liquidación en la lista."""

    mechanic = MechanicSummarySerializer(read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    services_count = serializers.SerializerMethodField()
    created_by = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = MechanicSettlement
        fields = [
            "id", "mechanic", "date", "labor_total", "percentage", "amount", "method", "method_label",
            "services_count", "created_by", "created_at",
        ]
        read_only_fields = fields

    def get_services_count(self, instance):
        return len(instance.services.all())


class MechanicSettlementDetailSerializer(MechanicSettlementSerializer):
    """Liquidación completa, como se imprime para el mecánico."""

    services = SettledServiceSerializer(many=True, read_only=True)

    class Meta(MechanicSettlementSerializer.Meta):
        fields = MechanicSettlementSerializer.Meta.fields + ["services"]
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
        "services__service_type", "services__sale__customer",
    ).get(pk=pk)
