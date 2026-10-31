from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models.functions import Lower

from .text import plain_text

# Código interno: letras y números en mayúsculas, separados por guiones opcionales.
# Ejemplos: FRE-PUL-PAS, ELE-UNI-BUJ, LL909018.
code_validator = RegexValidator(
    r"^[A-Z0-9]+(-[A-Z0-9]+)*$",
    "Usa solo letras, números y guiones, sin espacios ni otros símbolos.",
)
abbreviation_validator = RegexValidator(r"^[A-Z]{2,4}$", "La sigla debe tener de 2 a 4 letras.")

# Sigla reservada para los repuestos que sirven para cualquier moto.
UNIVERSAL_ABBREVIATION = "UNI"


def normalize_code(value):
    """FRE-PUL-PAS, fre-pul-pas y FREPULPAS son el mismo código: FREPULPAS."""
    return value.strip().upper().replace("-", "").replace(" ", "")


class NamedModel(models.Model):
    """Base para tipo, marca y moto: nombre único sin distinguir mayúsculas."""

    name = models.CharField("nombre", max_length=80)
    # Nombre en minúsculas y sin tildes para la búsqueda. Se calcula al guardar:
    # queryset.update() y bulk_update() no lo actualizan.
    search_name = models.CharField(max_length=80, editable=False, default="")
    is_active = models.BooleanField("activo", default=True)

    class Meta:
        abstract = True
        ordering = ["name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.name = " ".join(self.name.split())
        self.search_name = plain_text(self.name)
        if getattr(self, "abbreviation", None):
            self.abbreviation = self.abbreviation.strip().upper()
        super().save(*args, **kwargs)


class Category(NamedModel):
    """Tipo de producto: Frenos, Eléctrico, Llantas, Aceites..."""

    abbreviation = models.CharField(
        "sigla", max_length=4, validators=[abbreviation_validator],
        help_text="Primera parte del código, por ejemplo FRE para frenos.",
    )

    class Meta(NamedModel.Meta):
        verbose_name = "tipo"
        verbose_name_plural = "tipos"
        constraints = [
            models.UniqueConstraint(Lower("name"), name="category_name_unique"),
            models.UniqueConstraint("abbreviation", name="category_abbreviation_unique"),
        ]


class Brand(NamedModel):
    class Meta(NamedModel.Meta):
        verbose_name = "marca"
        verbose_name_plural = "marcas"
        constraints = [models.UniqueConstraint(Lower("name"), name="brand_name_unique")]


class MotoModel(NamedModel):
    """Moto a la que se aplica un repuesto: Pulsar 180, Boxer CT 100..."""

    abbreviation = models.CharField(
        "sigla", max_length=4, validators=[abbreviation_validator],
        help_text="Segunda parte del código, por ejemplo PUL para Pulsar. Puede repetirse entre versiones.",
    )

    class Meta(NamedModel.Meta):
        verbose_name = "moto"
        verbose_name_plural = "motos"
        constraints = [models.UniqueConstraint(Lower("name"), name="moto_model_name_unique")]

    def clean(self):
        if (self.abbreviation or "").strip().upper() == UNIVERSAL_ABBREVIATION:
            raise ValidationError({"abbreviation": "UNI está reservada para los repuestos universales."})


class Product(models.Model):
    """Referencia que se compra y se vende en unidades enteras.

    Las existencias no viven aquí: salen de los movimientos de inventario.
    """

    code = models.CharField("código", max_length=30, validators=[code_validator])
    # Código sin guiones: es el que se usa para buscar y para impedir duplicados.
    code_normalized = models.CharField(max_length=30, editable=False)
    name = models.CharField(
        "nombre", max_length=150,
        help_text="Empieza por la palabra clave: «Pastillas de freno Pulsar 180».",
    )
    # Nombre en minúsculas y sin tildes para la búsqueda; se calcula al guardar.
    search_text = models.CharField(max_length=150, editable=False, default="")
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products", verbose_name="tipo")
    brand = models.ForeignKey(
        Brand, on_delete=models.PROTECT, related_name="products", verbose_name="marca", null=True, blank=True,
    )
    moto = models.ForeignKey(
        MotoModel, on_delete=models.PROTECT, related_name="main_products", verbose_name="moto principal",
        null=True, blank=True, help_text="Vacío para los repuestos universales.",
    )
    compatible_motos = models.ManyToManyField(
        MotoModel, related_name="compatible_products", verbose_name="motos compatibles", blank=True,
    )
    # Pesos colombianos enteros: sin decimales ni punto flotante.
    cost_price = models.PositiveBigIntegerField("precio de costo")
    sale_price = models.PositiveBigIntegerField("precio de venta")
    min_stock = models.PositiveIntegerField("existencia mínima", default=0)
    location = models.CharField("ubicación", max_length=60, blank=True)
    is_workshop_supply = models.BooleanField(
        "insumo de taller", default=False,
        help_text="Se consume en los servicios y su valor va incluido en la mano de obra.",
    )
    is_active = models.BooleanField("activo", default=True)
    created_at = models.DateTimeField("creado", auto_now_add=True)
    updated_at = models.DateTimeField("actualizado", auto_now=True)

    class Meta:
        verbose_name = "producto"
        verbose_name_plural = "productos"
        ordering = ["name"]
        constraints = [models.UniqueConstraint("code_normalized", name="product_code_unique")]
        indexes = [models.Index(Lower("name"), name="product_name_lower_idx")]

    def __str__(self):
        return f"{self.code} · {self.name}"

    @property
    def is_universal(self):
        return self.moto_id is None

    @property
    def sells_below_cost(self):
        """El informe pide advertir, no impedir, cuando se vende por debajo del costo."""
        return self.sale_price < self.cost_price

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        self.code_normalized = normalize_code(self.code)
        self.name = " ".join(self.name.split())
        self.search_text = plain_text(self.name)
        super().save(*args, **kwargs)
