from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator
from django.db import models, transaction
from django.db.models import F, Q, Sum
from django.db.models.functions import Coalesce, Lower
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
        labor_total, percentage, share (su parte antes de descuentos),
        deductions_total (lo que se le descontará) y amount (lo que recibe),
        ordenada por nombre.
        """
        result = []
        mechanics = Mechanic.objects.filter(
            services__settlement__isnull=True, services__sale__voided_at__isnull=True,
            services__sale__created_at__date=day,
        ).distinct()
        for mechanic in mechanics:
            labor = [service.labor_price for service in self.pending_services(mechanic, day)]
            percentage = mechanic.effective_percentage
            share = mechanic_share(sum(labor), percentage)
            pending = sum(deduction.pending_amount for deduction in MechanicDeduction.objects.pending(mechanic))
            deductions_total = min(share, pending)
            result.append({
                "mechanic": mechanic, "services_count": len(labor), "labor_total": sum(labor),
                "percentage": percentage, "share": share, "deductions_total": deductions_total,
                "amount": share - deductions_total,
            })
        return result

    def settle(self, mechanic, day, user, method=PaymentMethod.CASH):
        """Paga al mecánico su parte de la mano de obra de los servicios sin pagar de ese día.

        Suma la mano de obra, aplica su porcentaje vigente y saca el valor de
        la caja abierta de hoy, aunque el día liquidado sea anterior. Cada
        servicio queda marcado con esta liquidación, así nunca se paga dos
        veces. Los repuestos no entran: son 100 % del local.

        Si el mecánico tiene descuentos por mal servicio, se restan de su parte,
        los más antiguos primero. Lo que no alcance a descontarse queda para la
        siguiente liquidación; si se descuenta todo, no sale dinero de la caja.

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
            share = mechanic_share(labor_total, percentage)
            applications = []
            remaining = share
            for deduction in MechanicDeduction.objects.pending(mechanic):
                if not remaining:
                    break
                applied = min(remaining, deduction.pending_amount)
                applications.append((deduction, applied))
                remaining -= applied
            amount = remaining
            if amount and CashSession.objects.current() is None:
                raise CashSessionClosed()
            settlement = self.create(
                mechanic=mechanic, date=day, labor_total=labor_total, percentage=percentage, amount=amount,
                deductions_total=share - amount, method=method, created_by=user,
            )
            for deduction, applied in applications:
                DeductionApplication.objects.create(deduction=deduction, settlement=settlement, amount=applied)
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
    porcentaje aplicado, descuentos y valor pagado. Los servicios pagados
    quedan enlazados (SaleService.settlement) y los descuentos, en
    deduction_applications. Si después de pagar se venden más servicios ese
    día, se liquidan aparte. No se edita ni se borra.
    """

    mechanic = models.ForeignKey(Mechanic, on_delete=models.PROTECT, related_name="settlements", verbose_name="mecánico")
    date = models.DateField("día liquidado")
    # Pesos enteros.
    labor_total = models.PositiveBigIntegerField("total de mano de obra")
    percentage = models.PositiveSmallIntegerField("porcentaje aplicado", validators=[MaxValueValidator(100)])
    # Lo que se le descontó en este pago. Su parte antes de descuentos es amount + deductions_total.
    deductions_total = models.PositiveBigIntegerField("descuentos aplicados", default=0)
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
            models.CheckConstraint(
                condition=Q(deductions_total__lte=models.F("labor_total") - models.F("amount")),
                name="settlement_share_within_labor",
                violation_error_message="El pago y los descuentos no pueden superar la mano de obra.",
            ),
        ]
        indexes = [models.Index(fields=["mechanic", "-date"], name="settlement_mechanic_date_idx")]

    def __str__(self):
        return f"Liquidación {self.date:%Y-%m-%d} · {self.mechanic}"


class MechanicDeductionManager(models.Manager):
    def with_applied(self):
        """Descuentos con lo ya descontado en `applied`, los más antiguos primero.

        El orden va explícito: agrupar por el Sum descarta el de Meta.
        """
        return self.annotate(
            applied=Coalesce(Sum("applications__amount"), 0, output_field=models.BigIntegerField()),
        ).order_by("id")

    def pending(self, mechanic):
        """Descuentos del mecánico que aún tienen saldo, los más antiguos primero."""
        return self.with_applied().filter(mechanic=mechanic, applied__lt=F("amount"))


class MechanicDeduction(models.Model):
    """Lo que se le debe descontar a un mecánico por una devolución con causa de mal servicio.

    Se crea con la devolución y se va pagando en sus liquidaciones: si en una no
    alcanza, el saldo pasa a la siguiente. El servicio, el cliente, la placa y
    el motivo se leen de la devolución. No se edita ni se borra.
    """

    mechanic = models.ForeignKey(Mechanic, on_delete=models.PROTECT, related_name="deductions", verbose_name="mecánico")
    sale_return = models.OneToOneField(
        "sales.SaleReturn", on_delete=models.PROTECT, related_name="mechanic_deduction", verbose_name="devolución",
    )
    # Pesos enteros: la mano de obra devuelta más los repuestos que no pueden volver.
    amount = models.PositiveBigIntegerField("valor a descontar")
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = MechanicDeductionManager()

    class Meta:
        verbose_name = "descuento a mecánico"
        verbose_name_plural = "descuentos a mecánicos"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="deduction_amount_positive",
                violation_error_message="El valor debe ser mayor que cero.",
            ),
        ]

    def __str__(self):
        return f"Descuento {self.amount} · {self.mechanic}"

    @property
    def applied_amount(self):
        """Lo ya descontado en liquidaciones."""
        return self.applications.aggregate(total=Sum("amount"))["total"] or 0

    @property
    def pending_amount(self):
        """Lo que falta por descontar."""
        return self.amount - self.applied_amount


class DeductionApplication(models.Model):
    """Parte de un descuento aplicada en una liquidación, para mostrarla en el recibo del mecánico."""

    deduction = models.ForeignKey(
        MechanicDeduction, on_delete=models.PROTECT, related_name="applications", verbose_name="descuento",
    )
    settlement = models.ForeignKey(
        MechanicSettlement, on_delete=models.PROTECT, related_name="deduction_applications",
        verbose_name="liquidación",
    )
    # Pesos enteros.
    amount = models.PositiveBigIntegerField("valor descontado")

    class Meta:
        verbose_name = "descuento aplicado"
        verbose_name_plural = "descuentos aplicados"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="deduction_application_positive",
                violation_error_message="El valor debe ser mayor que cero.",
            ),
            models.UniqueConstraint(
                "deduction", "settlement", name="deduction_application_unique",
                violation_error_message="Este descuento ya está en la liquidación.",
            ),
        ]

    def __str__(self):
        return f"{self.amount} · liquidación {self.settlement_id}"
