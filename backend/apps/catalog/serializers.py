from django.core.exceptions import ObjectDoesNotExist
from django.db import IntegrityError
from rest_framework import serializers

from .codes import suggest_code
from .models import (
    UNIVERSAL_ABBREVIATION,
    Brand,
    Category,
    MotoModel,
    Product,
    abbreviation_validator,
    code_validator,
    normalize_code,
)
from .text import plain_text

# --- Tipo, marca y moto ----------------------------------------------------


class NamedModelSerializer(serializers.ModelSerializer):
    """Base para tipo, marca y moto: nombre limpio y único sin distinguir mayúsculas."""

    duplicate_name_message = "Ya existe un registro con ese nombre."

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        same_name = self.Meta.model.objects.filter(name__iexact=value)
        if self.instance:
            same_name = same_name.exclude(pk=self.instance.pk)
        if same_name.exists():
            raise serializers.ValidationError(self.duplicate_name_message)
        return value



class AbbreviationMixin(serializers.Serializer):
    """La sigla se acepta en minúsculas: primero se pasa a mayúsculas y luego se valida el formato."""

    abbreviation = serializers.CharField(max_length=10)

    def validate_abbreviation(self, value):
        value = value.strip().upper()
        abbreviation_validator(value)
        return value


class CategorySerializer(AbbreviationMixin, NamedModelSerializer):
    duplicate_name_message = "Ya existe un tipo con ese nombre."

    class Meta:
        model = Category
        fields = ["id", "name", "abbreviation", "is_active"]
        # La unicidad de la sigla se valida a mano para dar un mensaje claro.
        validators = []

    def validate_abbreviation(self, value):
        value = super().validate_abbreviation(value)
        same = Category.objects.filter(abbreviation=value)
        if self.instance:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError("Ya existe un tipo con esa sigla.")
        return value


class BrandSerializer(NamedModelSerializer):
    duplicate_name_message = "Ya existe una marca con ese nombre."

    class Meta:
        model = Brand
        fields = ["id", "name", "is_active"]
        validators = []


class MotoModelSerializer(AbbreviationMixin, NamedModelSerializer):
    duplicate_name_message = "Ya existe una moto con ese nombre."

    class Meta:
        model = MotoModel
        fields = ["id", "name", "abbreviation", "is_active"]
        validators = []

    def validate_abbreviation(self, value):
        value = super().validate_abbreviation(value)
        if value == UNIVERSAL_ABBREVIATION:
            raise serializers.ValidationError("UNI está reservada para los repuestos universales.")
        return value


# --- Producto ----------------------------------------------------------------


class ProductSerializer(serializers.ModelSerializer):
    """Producto tal como lo ve la interfaz.

    El costo y la advertencia de venta bajo el costo solo se envían al dueño:
    el vendedor no ve costos.
    """

    category = CategorySerializer(read_only=True)
    brand = BrandSerializer(read_only=True)
    moto = MotoModelSerializer(read_only=True)
    compatible_motos = MotoModelSerializer(many=True, read_only=True)
    is_universal = serializers.BooleanField(read_only=True)
    sells_below_cost = serializers.BooleanField(read_only=True)
    stock = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()

    OWNER_ONLY_FIELDS = ("cost_price", "sells_below_cost")

    class Meta:
        model = Product
        fields = [
            "id", "code", "name", "category", "brand", "moto", "compatible_motos", "is_universal",
            "cost_price", "sale_price", "sells_below_cost", "stock", "min_stock", "is_low_stock", "location",
            "is_workshop_supply", "is_active", "updated_at",
        ]
        read_only_fields = fields

    def get_stock(self, instance):
        # Un producto sin registro de existencia todavía no tiene unidades.
        try:
            return instance.balance.quantity
        except ObjectDoesNotExist:
            return 0

    def get_is_low_stock(self, instance):
        return self.get_stock(instance) <= instance.min_stock

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _is_owner(self.context):
            for field in self.OWNER_ONLY_FIELDS:
                data.pop(field, None)
        return data


class ProductWriteSerializer(serializers.ModelSerializer):
    """Alta y edición de productos. Se envían ids para tipo, marca y motos.

    Si el código llega vacío, se genera con la sugerencia automática.
    """

    code = serializers.CharField(max_length=30, required=False, allow_blank=True)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True))
    brand = serializers.PrimaryKeyRelatedField(
        queryset=Brand.objects.filter(is_active=True), required=False, allow_null=True,
    )
    moto = serializers.PrimaryKeyRelatedField(
        queryset=MotoModel.objects.filter(is_active=True), required=False, allow_null=True,
    )
    compatible_motos = serializers.PrimaryKeyRelatedField(
        queryset=MotoModel.objects.filter(is_active=True), many=True, required=False,
    )

    class Meta:
        model = Product
        fields = [
            "code", "name", "category", "brand", "moto", "compatible_motos",
            "cost_price", "sale_price", "min_stock", "location", "is_workshop_supply", "is_active",
        ]

    def validate_code(self, value):
        value = value.strip().upper()
        if not value:
            return value
        code_validator(value)
        same = Product.objects.filter(code_normalized=normalize_code(value))
        if self.instance:
            same = same.exclude(pk=self.instance.pk)
        if same.exists():
            raise serializers.ValidationError("Ya existe un producto con ese código.")
        return value

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_sale_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("El precio de venta debe ser mayor que cero.")
        return value

    def _reject_duplicate(self, attrs):
        """Rechaza otro producto con el mismo nombre, marca y moto.

        El código no sirve para detectarlo: el generador le agrega un número
        (FRE-PUL-PAS2). La regla va aquí y no en la base porque puede haber
        duplicados de antes. Por eso, al editar solo se revisa si cambia lo que
        identifica al producto o si se reactiva: así un duplicado viejo se puede
        corregir o desactivar.
        """
        product = self.instance
        name = plain_text(attrs.get("name", getattr(product, "name", "")))
        brand = attrs.get("brand", getattr(product, "brand", None))
        moto = attrs.get("moto", getattr(product, "moto", None))
        same = Product.objects.filter(search_text=name, brand=brand, moto=moto)
        if product is not None:
            same = same.exclude(pk=product.pk)
            if (name, brand, moto) == (product.search_text, product.brand, product.moto):
                if product.is_active or not attrs.get("is_active"):
                    return
                # Reactivarlo solo choca con otro activo: dos desactivados no estorban.
                same = same.filter(is_active=True)
        other = same.order_by("-is_active").first()
        if other is None:
            return
        if other.is_active:
            message = f"Este producto ya existe con la misma marca y moto: {other.code}."
        else:
            message = f"Este producto ya existe desactivado: {other.code}. Actívalo en lugar de crearlo otra vez."
        raise serializers.ValidationError({"name": [message]})

    def validate(self, attrs):
        self._reject_duplicate(attrs)
        moto = attrs.get("moto", getattr(self.instance, "moto", None))
        if "compatible_motos" in attrs and moto is not None:
            # La moto principal no se repite como compatible.
            attrs["compatible_motos"] = [m for m in attrs["compatible_motos"] if m.pk != moto.pk]

        if not attrs.get("code") and (self.instance is None or "code" in attrs):
            code = suggest_code(
                attrs.get("category", getattr(self.instance, "category", None)),
                attrs.get("name", getattr(self.instance, "name", "")),
                moto,
                exclude_pk=getattr(self.instance, "pk", None),
            )
            if not code:
                raise serializers.ValidationError(
                    {"code": ["No se pudo generar el código: escríbelo o revisa el nombre."]}
                )
            attrs["code"] = code
        return attrs

    def save(self, **kwargs):
        try:
            return super().save(**kwargs)
        except IntegrityError:
            # Dos altas simultáneas con el mismo código: la base de datos lo impide.
            raise serializers.ValidationError({"code": ["Ya existe un producto con ese código."]})

    def to_representation(self, instance):
        return ProductSerializer(instance, context=self.context).data


class CodeSuggestionSerializer(serializers.Serializer):
    """Datos que envía el formulario mientras el dueño escribe, para sugerir el código."""

    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    name = serializers.CharField()
    moto = serializers.PrimaryKeyRelatedField(queryset=MotoModel.objects.all(), required=False, allow_null=True)
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), required=False, allow_null=True,
        help_text="Producto que se está editando, para no chocar con su propio código.",
    )

    def suggestion(self):
        data = self.validated_data
        product = data.get("product")
        return suggest_code(data["category"], data["name"], data.get("moto"), exclude_pk=product.pk if product else None)


def _is_owner(context):
    request = context.get("request")
    user = getattr(request, "user", None)
    return bool(user and user.is_authenticated and user.is_owner)
