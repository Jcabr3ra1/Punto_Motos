from rest_framework import serializers

from apps.catalog.serializers import NamedModelSerializer, _is_owner
from apps.purchases.serializers import clean_text

from .models import Mechanic, ServiceType


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
