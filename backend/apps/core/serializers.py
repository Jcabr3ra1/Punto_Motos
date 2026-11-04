from rest_framework import serializers

from .models import BusinessSettings


class BusinessSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessSettings
        fields = ["name", "tax_id", "address", "phone", "receipt_footer", "default_mechanic_percentage", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre del negocio es obligatorio.")
        return value
