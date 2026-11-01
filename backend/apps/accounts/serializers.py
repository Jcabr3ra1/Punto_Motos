from django.contrib.auth import authenticate, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Role, User

LAST_OWNER_MESSAGE = "Debe quedar al menos un dueño activo."


class UserSerializer(serializers.ModelSerializer):
    """Usuario tal como lo ve la interfaz. Nunca incluye la contraseña."""

    display_name = serializers.CharField(read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "display_name",
            "role", "role_label", "is_active", "last_login",
        ]
        read_only_fields = fields


class UserCreateSerializer(serializers.ModelSerializer):
    """Alta de un usuario por parte del dueño."""

    password = serializers.CharField(write_only=True, trim_whitespace=False, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["username", "first_name", "last_name", "role", "password"]
        extra_kwargs = {"role": {"required": True}}

    def validate_username(self, value):
        # «Pedro», «pedro» y « pedro » son el mismo usuario.
        value = value.strip().lower()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Ya existe un usuario con ese nombre.")
        return value

    def validate(self, attrs):
        candidate = User(**{k: v for k, v in attrs.items() if k != "password"})
        _validate_password(attrs["password"], candidate, field="password")
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

    def to_representation(self, instance):
        return UserSerializer(instance).data


class UserUpdateSerializer(serializers.ModelSerializer):
    """Edición de nombre, rol y estado. El usuario y la contraseña no se cambian aquí."""

    class Meta:
        model = User
        fields = ["first_name", "last_name", "role", "is_active"]

    def validate(self, attrs):
        user = self.instance
        stays_active_owner = (
            attrs.get("role", user.role) == Role.OWNER and attrs.get("is_active", user.is_active)
        )
        if user.is_owner and user.is_active and not stays_active_owner:
            other_owners = User.objects.filter(role=Role.OWNER, is_active=True).exclude(pk=user.pk)
            if not other_owners.exists():
                raise serializers.ValidationError(LAST_OWNER_MESSAGE)
        return attrs

    def to_representation(self, instance):
        return UserSerializer(instance).data


class SetPasswordSerializer(serializers.Serializer):
    """El dueño asigna una contraseña nueva a un usuario (por ejemplo, si la olvidó)."""

    new_password = serializers.CharField(write_only=True, trim_whitespace=False, style={"input_type": "password"})

    def validate_new_password(self, value):
        _validate_password(value, self.instance)
        return value

    def save(self, **kwargs):
        self.instance.set_password(self.validated_data["new_password"])
        self.instance.save(update_fields=["password"])
        return self.instance


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False, style={"input_type": "password"})

    def validate(self, attrs):
        user = authenticate(username=attrs["username"].strip().lower(), password=attrs["password"])
        # Mismo mensaje para usuario inexistente, contraseña errada o usuario
        # desactivado: no se revela cuál de los tres falló.
        if user is None:
            raise serializers.ValidationError("Usuario o contraseña incorrectos.", code="invalid_credentials")
        attrs["user"] = user
        return attrs


def _validate_password(password, user, field=None):
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({field: exc.messages} if field else exc.messages)
