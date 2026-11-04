from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator
from django.db import models, transaction
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind, CashSession, CashSessionClosed
from apps.catalog.models import NamedModel
from apps.core.models import BusinessSettings, PaymentMethod


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


class NothingToSettle(Exception):
    """El mecánico no tiene servicios sin pagar ese día."""


def mechanic_share(labor_total, percentage):
    """Parte del mecánico en pesos enteros, redondeada al peso más cercano (0,5 sube)."""
    return (labor_total * percentage + 50) // 100


class MechanicSettlementManager(models.Manager):
    def pending_services(self, mechanic, day):
        """Servicios del mecánico vendidos ese día (hora de Colombia) que todavía no se le pagan.

        Los de ventas anuladas no cuentan.
        """
        return mechanic.services.filter(
            settlement__isnull=True, sale__voided_at__isnull=True, sale__created_at__date=day,
        )

    def preview(self, day):
        """Lo que se le debe a cada mecánico con servicios sin pagar ese día, para mostrarlo antes de pagar.

        Devuelve una lista de diccionarios con mechanic, services_count,
        labor_total, percentage y amount, ordenada por nombre.
        """
        result = []
        mechanics = Mechanic.objects.filter(
            services__settlement__isnull=True, services__sale__voided_at__isnull=True,
            services__sale__created_at__date=day,
        ).distinct()
        for mechanic in mechanics:
            labor = [service.labor_price for service in self.pending_services(mechanic, day)]
            percentage = mechanic.effective_percentage
            result.append({
                "mechanic": mechanic, "services_count": len(labor), "labor_total": sum(labor),
                "percentage": percentage, "amount": mechanic_share(sum(labor), percentage),
            })
        return result

    def settle(self, mechanic, day, user, method=PaymentMethod.CASH):
        """Paga al mecánico su parte de la mano de obra de los servicios sin pagar de ese día.

        Suma la mano de obra, aplica su porcentaje vigente y saca el valor de
        la caja abierta de hoy, aunque el día liquidado sea anterior. Cada
        servicio queda marcado con esta liquidación, así nunca se paga dos
        veces. Los repuestos no entran: son 100 % del local.

        Un día futuro lanza ValidationError; sin servicios pendientes,
        NothingToSettle; con valor a pagar y sin caja abierta,
        CashSessionClosed. Si algo falla no queda nada.
        """
        if day > timezone.localdate():
            raise ValidationError({"date": "No se puede liquidar un día que no ha llegado."})
        with transaction.atomic():
            services = list(self.pending_services(mechanic, day))
            if not services:
                raise NothingToSettle()
            labor_total = sum(service.labor_price for service in services)
            percentage = mechanic.effective_percentage
            amount = mechanic_share(labor_total, percentage)
            if amount and CashSession.objects.current() is None:
                raise CashSessionClosed()
            settlement = self.create(
                mechanic=mechanic, date=day, labor_total=labor_total, percentage=percentage, amount=amount,
                method=method, created_by=user,
            )
            # Cambio condicional: si otra liquidación tomó alguno de estos servicios, se deshace todo.
            marked = mechanic.services.filter(
                pk__in=[service.pk for service in services], settlement__isnull=True,
            ).update(settlement=settlement)
            if marked != len(services):
                raise NothingToSettle()
            if amount:
                CashMovement.objects.record(
                    CashMovementKind.MECHANIC_PAYMENT, -amount, method, user,
                    reason=f"Liquidación {day:%Y-%m-%d} · {mechanic.name}", mechanic_settlement=settlement,
                )
        return settlement


class MechanicSettlement(models.Model):
    """Pago a un mecánico por los servicios de un día: su parte de la mano de obra.

    Guarda solo lo que pide el negocio: mecánico, día, total de mano de obra,
    porcentaje aplicado y valor pagado. Los servicios pagados quedan
    enlazados (SaleService.settlement). Si después de pagar se venden más
    servicios ese día, se liquidan aparte. No se edita ni se borra.
    """

    mechanic = models.ForeignKey(Mechanic, on_delete=models.PROTECT, related_name="settlements", verbose_name="mecánico")
    date = models.DateField("día liquidado")
    # Pesos enteros.
    labor_total = models.PositiveBigIntegerField("total de mano de obra")
    percentage = models.PositiveSmallIntegerField("porcentaje aplicado", validators=[MaxValueValidator(100)])
    amount = models.PositiveBigIntegerField("valor pagado")
    method = models.CharField("medio de pago", max_length=10, choices=PaymentMethod.choices)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="mechanic_settlements",
        verbose_name="pagada por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = MechanicSettlementManager()

    class Meta:
        verbose_name = "liquidación de mecánico"
        verbose_name_plural = "liquidaciones de mecánicos"
        ordering = ["-date", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(percentage__lte=100), name="settlement_percentage_range",
                violation_error_message="El porcentaje debe estar entre 0 y 100.",
            ),
            models.CheckConstraint(
                condition=Q(amount__lte=models.F("labor_total")), name="settlement_amount_within_labor",
                violation_error_message="El pago no puede superar la mano de obra.",
            ),
        ]
        indexes = [models.Index(fields=["mechanic", "-date"], name="settlement_mechanic_date_idx")]

    def __str__(self):
        return f"Liquidación {self.date:%Y-%m-%d} · {self.mechanic}"
