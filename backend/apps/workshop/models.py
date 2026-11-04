from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.catalog.models import NamedModel
from apps.core.models import BusinessSettings


class ServiceType(NamedModel):
    """Tipo de servicio del taller: cambio de aceite, frenos, mantenimiento general...

    Cada servicio se registra como una línea de la venta con su mecánico. El
    código es numérico para agregarlo rápido desde el buscador de la venta
    (escribir 101 trae el servicio 101). El precio es una sugerencia: el
    valor final se acuerda con el cliente y solo el dueño puede cambiarlo.
    """

    code = models.PositiveIntegerField("código", help_text="Número corto para el buscador de la venta, por ejemplo 101.")
    suggested_price = models.PositiveBigIntegerField("precio sugerido", help_text="Mano de obra en pesos enteros.")
    # Para el tipo «Otro»: obliga a escribir en la venta qué se hizo.
    needs_description = models.BooleanField(
        "pide descripción", default=False,
        help_text="La venta debe decir qué servicio se hizo, por ejemplo en el tipo «Otro».",
    )

    class Meta(NamedModel.Meta):
        verbose_name = "tipo de servicio"
        verbose_name_plural = "tipos de servicio"
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(
                Lower("name"), name="service_type_name_unique",
                violation_error_message="Ya existe un tipo de servicio con este nombre.",
            ),
            models.UniqueConstraint(
                "code", name="service_type_code_unique",
                violation_error_message="Ya existe un tipo de servicio con este código.",
            ),
            models.CheckConstraint(
                condition=Q(code__gt=0), name="service_type_code_positive",
                violation_error_message="El código debe ser mayor que cero.",
            ),
        ]

    def __str__(self):
        return f"{self.code} · {self.name}"


class Mechanic(NamedModel):
    """Empleado que realiza los servicios del taller.

    Es un registro de empleado, no un usuario: no inicia sesión en el
    programa. Su porcentaje de la mano de obra se usa en la liquidación
    diaria; si no tiene uno propio usa el general de los datos del negocio.
    No se borra: se desactiva.
    """

    phone = models.CharField("teléfono", max_length=30, blank=True)
    # Vacío = usa el porcentaje general (BusinessSettings.default_mechanic_percentage).
    labor_percentage = models.PositiveSmallIntegerField(
        "porcentaje de la mano de obra", null=True, blank=True, validators=[MaxValueValidator(100)],
        help_text="Parte de la mano de obra que le corresponde. Vacío para usar el porcentaje general.",
    )

    class Meta(NamedModel.Meta):
        verbose_name = "mecánico"
        verbose_name_plural = "mecánicos"
        constraints = [
            models.UniqueConstraint(
                Lower("name"), name="mechanic_name_unique",
                violation_error_message="Ya existe un mecánico con este nombre.",
            ),
            models.CheckConstraint(
                condition=Q(labor_percentage__isnull=True) | Q(labor_percentage__lte=100),
                name="mechanic_percentage_range",
                violation_error_message="El porcentaje debe estar entre 0 y 100.",
            ),
        ]

    @property
    def effective_percentage(self):
        """El porcentaje con que se le liquida hoy: el suyo o, si no tiene, el general."""
        if self.labor_percentage is not None:
            return self.labor_percentage
        return BusinessSettings.load().default_mechanic_percentage
