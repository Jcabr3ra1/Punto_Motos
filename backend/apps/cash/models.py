from django.conf import settings
from django.db import models, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.core.models import PaymentMethod


class CashSessionClosed(Exception):
    """No hay caja abierta: no entra ni sale dinero hasta abrirla."""


class CashSessionAlreadyOpen(Exception):
    """Ya hay una caja abierta: se cierra antes de abrir otra."""


class CashDifferenceUnexplained(Exception):
    """El efectivo contado no coincide con el esperado y falta la explicación."""


class CashSessionManager(models.Manager):
    def current(self):
        """La caja abierta, o None."""
        return self.filter(closed_at__isnull=True).first()

    def open(self, opening_cash, user):
        """Abre la jornada con el efectivo que hay en el cajón. Solo puede haber una abierta."""
        if self.filter(closed_at__isnull=True).exists():
            raise CashSessionAlreadyOpen()
        return self.create(opening_cash=opening_cash, opened_by=user)


class CashSession(models.Model):
    """Jornada de caja: se abre con un saldo de efectivo y se cierra contándolo.

    Todo lo que entra o sale de dinero queda como CashMovement de la caja
    abierta. Al cerrar se guarda el efectivo esperado, el contado y la
    explicación de la diferencia. Una caja cerrada no cambia.
    """

    # Pesos enteros.
    opening_cash = models.PositiveBigIntegerField("efectivo inicial")
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cash_sessions_opened",
        verbose_name="abierta por",
    )
    opened_at = models.DateTimeField("abierta", auto_now_add=True)
    expected_cash = models.BigIntegerField("efectivo esperado", null=True, blank=True)
    counted_cash = models.PositiveBigIntegerField("efectivo contado", null=True, blank=True)
    closing_notes = models.CharField("explicación del cierre", max_length=300, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
        related_name="cash_sessions_closed", verbose_name="cerrada por",
    )
    closed_at = models.DateTimeField("cerrada", null=True, blank=True)

    objects = CashSessionManager()

    class Meta:
        verbose_name = "caja"
        verbose_name_plural = "cajas"
        ordering = ["-opened_at", "-id"]
        constraints = [
            # Una sola caja abierta: todas las abiertas tienen closed_at vacío y
            # la base no deja dos filas iguales en ese índice parcial.
            models.UniqueConstraint(
                models.Value(1), condition=Q(closed_at__isnull=True), name="cash_session_one_open",
                violation_error_message="Ya hay una caja abierta.",
            ),
            models.CheckConstraint(
                condition=(
                    Q(closed_at__isnull=True, closed_by__isnull=True, counted_cash__isnull=True,
                      expected_cash__isnull=True)
                    | Q(closed_at__isnull=False, closed_by__isnull=False, counted_cash__isnull=False,
                        expected_cash__isnull=False)
                ),
                name="cash_session_closed_complete",
            ),
        ]

    def __str__(self):
        return f"Caja {self.pk} · {timezone.localtime(self.opened_at):%Y-%m-%d}"

    @property
    def is_open(self):
        return self.closed_at is None

    def total(self, method, kinds=None):
        """Suma con signo de los movimientos en un medio, opcionalmente solo de ciertos tipos."""
        movements = self.movements.filter(method=method)
        if kinds is not None:
            movements = movements.filter(kind__in=kinds)
        return movements.aggregate(total=Sum("amount"))["total"] or 0

    @property
    def current_expected_cash(self):
        """Efectivo que debería haber en el cajón: el inicial más lo que entró menos lo que salió."""
        if not self.is_open:
            return self.expected_cash
        return self.opening_cash + self.total(PaymentMethod.CASH)

    @property
    def difference(self):
        """Contado menos esperado al cerrar: positivo sobra, negativo falta. None mientras está abierta."""
        if self.is_open:
            return None
        return self.counted_cash - self.expected_cash

    def close(self, counted_cash, user, notes=""):
        """Cierra la caja con el efectivo contado. Si no cuadra, notes es obligatorio."""
        notes = " ".join(notes.split())
        with transaction.atomic():
            if not CashSession.objects.filter(pk=self.pk, closed_at__isnull=True).exists():
                raise CashSessionClosed()
            expected = self.opening_cash + self.total(PaymentMethod.CASH)
            if counted_cash != expected and not notes:
                raise CashDifferenceUnexplained()
            # Cambio condicional: un segundo cierre (doble clic) no pasa.
            closed = CashSession.objects.filter(pk=self.pk, closed_at__isnull=True).update(
                expected_cash=expected, counted_cash=counted_cash, closing_notes=notes, closed_by=user,
                closed_at=timezone.now(),
            )
            if not closed:
                raise CashSessionClosed()
        self.refresh_from_db()


class CashMovementKind(models.TextChoices):
    SALE = "sale", "Venta"
    SALE_REFUND = "sale_refund", "Reembolso de venta"
    CONSIGNEE_PAYMENT = "consignee_payment", "Pago de local en consignación"
    SUPPLIER_PAYMENT = "supplier_payment", "Abono a proveedor"
    EXPENSE = "expense", "Gasto"
    OWNER_WITHDRAWAL = "owner_withdrawal", "Retiro del dueño"
    MECHANIC_PAYMENT = "mechanic_payment", "Pago a mecánico"


INCOMING_KINDS = [CashMovementKind.SALE, CashMovementKind.CONSIGNEE_PAYMENT]
OUTGOING_KINDS = [
    CashMovementKind.SALE_REFUND, CashMovementKind.SUPPLIER_PAYMENT, CashMovementKind.EXPENSE,
    CashMovementKind.OWNER_WITHDRAWAL, CashMovementKind.MECHANIC_PAYMENT,
]
# Los que se registran a mano en la caja necesitan decir en qué se fue la plata.
MANUAL_KINDS = [CashMovementKind.EXPENSE, CashMovementKind.OWNER_WITHDRAWAL]


class CashMovementManager(models.Manager):
    def record(self, kind, amount, method, user, reason="", **source):
        """Registra dinero que entra (amount positivo) o sale (negativo) en la caja abierta.

        source es el documento que lo origina: sale=, supplier_payment= o
        consignee_payment= o mechanic_settlement=. Sin caja abierta lanza CashSessionClosed. Debe
        llamarse dentro de la transacción del documento para que todo se
        deshaga junto si algo falla.
        """
        session = CashSession.objects.current()
        if session is None:
            raise CashSessionClosed()
        movement = self.model(
            session=session, kind=kind, amount=amount, method=method, created_by=user,
            reason=" ".join(reason.split()), **source,
        )
        movement.full_clean()
        movement.save()
        return movement

    def spend(self, kind, amount, method, user, reason):
        """Gasto o retiro del dueño: sale dinero de la caja con su motivo."""
        if kind not in MANUAL_KINDS:
            raise ValueError("Solo gastos y retiros se registran a mano.")
        return self.record(kind, -amount, method, user, reason=reason)


class CashMovement(models.Model):
    """Dinero que entra o sale de la caja, con su causa. No se edita ni se borra."""

    session = models.ForeignKey(CashSession, on_delete=models.PROTECT, related_name="movements", verbose_name="caja")
    kind = models.CharField("tipo", max_length=20, choices=CashMovementKind.choices)
    method = models.CharField("medio de pago", max_length=10, choices=PaymentMethod.choices)
    # Pesos enteros con signo: positivo entra, negativo sale.
    amount = models.BigIntegerField("valor")
    reason = models.CharField("motivo", max_length=200, blank=True)
    # Documento que originó el movimiento; los gastos y retiros no tienen.
    sale = models.ForeignKey(
        "sales.Sale", on_delete=models.PROTECT, null=True, blank=True, related_name="cash_movements",
        verbose_name="venta",
    )
    supplier_payment = models.ForeignKey(
        "purchases.SupplierPayment", on_delete=models.PROTECT, null=True, blank=True,
        related_name="cash_movements", verbose_name="abono a proveedor",
    )
    consignee_payment = models.ForeignKey(
        "consignments.ConsigneePayment", on_delete=models.PROTECT, null=True, blank=True,
        related_name="cash_movements", verbose_name="pago de local",
    )
    mechanic_settlement = models.ForeignKey(
        "workshop.MechanicSettlement", on_delete=models.PROTECT, null=True, blank=True,
        related_name="cash_movements", verbose_name="liquidación de mecánico",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="cash_movements",
        verbose_name="registrado por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = CashMovementManager()

    class Meta:
        verbose_name = "movimiento de caja"
        verbose_name_plural = "movimientos de caja"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(kind__in=INCOMING_KINDS) | Q(amount__gt=0), name="cash_incoming_positive",
                violation_error_message="Este tipo de movimiento solo puede sumar.",
            ),
            models.CheckConstraint(
                condition=~Q(kind__in=OUTGOING_KINDS) | Q(amount__lt=0), name="cash_outgoing_negative",
                violation_error_message="Este tipo de movimiento solo puede restar.",
            ),
            models.CheckConstraint(
                condition=~Q(kind__in=MANUAL_KINDS) | ~Q(reason=""), name="cash_manual_reason",
                violation_error_message="Indica en qué se usó el dinero.",
            ),
            models.CheckConstraint(
                condition=~Q(kind__in=[CashMovementKind.SALE, CashMovementKind.SALE_REFUND]) | Q(sale__isnull=False),
                name="cash_sale_has_sale",
            ),
            models.CheckConstraint(
                condition=~Q(kind=CashMovementKind.SUPPLIER_PAYMENT) | Q(supplier_payment__isnull=False),
                name="cash_supplier_payment_has_payment",
            ),
            models.CheckConstraint(
                condition=~Q(kind=CashMovementKind.CONSIGNEE_PAYMENT) | Q(consignee_payment__isnull=False),
                name="cash_consignee_payment_has_payment",
            ),
            models.CheckConstraint(
                condition=~Q(kind=CashMovementKind.MECHANIC_PAYMENT) | Q(mechanic_settlement__isnull=False),
                name="cash_mechanic_payment_has_settlement",
            ),
        ]
        indexes = [models.Index(fields=["session", "method"], name="cash_movement_session_idx")]

    def __str__(self):
        return f"{self.get_kind_display()} {self.amount:+d} · {self.get_method_display()}"
