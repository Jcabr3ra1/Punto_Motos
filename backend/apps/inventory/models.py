from django.conf import settings
from django.db import models, transaction
from django.db.models import F, Q

from apps.catalog.models import Product


class MovementKind(models.TextChoices):
    INITIAL_COUNT = "initial_count", "Inventario inicial"
    PURCHASE = "purchase", "Compra"
    SALE = "sale", "Venta"
    RETURN = "return", "Devolución"
    ADJUSTMENT = "adjustment", "Ajuste"
    CONSIGNMENT_OUT = "consignment_out", "Entrega en consignación"
    CONSIGNMENT_RETURN = "consignment_return", "Devolución de consignación"
    WORKSHOP_USE = "workshop_use", "Consumo del taller"


# Tipos que solo suman y tipos que solo restan. El ajuste puede ir en ambos sentidos.
INCOMING_KINDS = [
    MovementKind.INITIAL_COUNT, MovementKind.PURCHASE, MovementKind.RETURN, MovementKind.CONSIGNMENT_RETURN,
]
OUTGOING_KINDS = [MovementKind.SALE, MovementKind.CONSIGNMENT_OUT, MovementKind.WORKSHOP_USE]


class NotWorkshopSupply(Exception):
    """Solo los productos marcados como insumo de taller se sacan por consumo interno."""

    def __init__(self, product):
        self.product = product
        super().__init__(f"{product.code} no está marcado como insumo de taller.")


class InitialCountOpen(Exception):
    """No salen unidades mientras el inventario inicial sigue abierto: las existencias todavía no son reales."""


class InsufficientStock(Exception):
    """La salida dejaría la existencia en negativo. Las vistas la responderán como 409."""

    def __init__(self, product, available, requested):
        self.product = product
        self.available = available
        self.requested = requested
        super().__init__(f"{product.code}: hay {available} y se piden {requested}.")


class InventoryBalance(models.Model):
    """Existencia actual de un producto.

    Es una copia rápida de la suma de sus movimientos para no recalcularla en
    cada búsqueda. Solo cambia a través de InventoryMovement.objects.record().
    Un producto sin registro aquí tiene 0 unidades.
    """

    product = models.OneToOneField(
        Product, on_delete=models.PROTECT, primary_key=True, related_name="balance", verbose_name="producto",
    )
    # PositiveIntegerField crea en la base una restricción que impide negativos.
    quantity = models.PositiveIntegerField("existencia", default=0)
    updated_at = models.DateTimeField("actualizado", auto_now=True)

    class Meta:
        verbose_name = "existencia"
        verbose_name_plural = "existencias"

    def __str__(self):
        return f"{self.product.code}: {self.quantity}"


class InventoryMovementManager(models.Manager):
    def record(self, product, kind, quantity, user, unit_cost=None, reason=""):
        """Registra una entrada (cantidad positiva) o una salida (negativa) y actualiza la existencia.

        Movimiento y existencia se guardan juntos o no se guarda ninguno. Una
        salida mayor que la existencia lanza InsufficientStock sin dejar rastro.
        Debe llamarse dentro de la transacción del documento que la origina
        (compra, venta...) para que todo se deshaga si algo falla después.
        """
        movement = self.model(
            product=product, kind=kind, quantity=quantity, created_by=user,
            unit_cost=product.cost_price if unit_cost is None else unit_cost,
            reason=" ".join(reason.split()), balance_after=0,
        )
        movement.full_clean(exclude=["balance_after"])

        with transaction.atomic():
            InventoryBalance.objects.get_or_create(product=product)
            # Actualización condicional: la base solo suma si la existencia alcanza,
            # así dos ventas simultáneas no pueden dejarla en negativo.
            updated = InventoryBalance.objects.filter(product=product, quantity__gte=-quantity).update(
                quantity=F("quantity") + quantity,
            )
            balance = InventoryBalance.objects.get(product=product)
            product.balance = balance  # que product.balance no quede con la existencia anterior
            if not updated:
                raise InsufficientStock(product, available=balance.quantity, requested=-quantity)
            movement.balance_after = balance.quantity
            movement.save()
        return movement

    def use_in_workshop(self, product, quantity, user, reason=""):
        """Saca unidades de un insumo de taller que se abrió para usarlo en los servicios.

        No se le cobra al cliente: su valor va incluido en la mano de obra. Así
        el inventario cuadra sin medir pequeñas cantidades. Un producto que no
        es insumo de taller lanza NotWorkshopSupply; si no alcanza la
        existencia, InsufficientStock.
        """
        if not product.is_workshop_supply:
            raise NotWorkshopSupply(product)
        return self.record(product, MovementKind.WORKSHOP_USE, -quantity, user, reason=reason)


class InventoryMovement(models.Model):
    """Entrada o salida de unidades de un producto, con su causa.

    Los movimientos no se editan ni se borran: un error se corrige con otro
    movimiento (una devolución o un ajuste con motivo).
    """

    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="movements", verbose_name="producto",
    )
    kind = models.CharField("tipo", max_length=20, choices=MovementKind.choices)
    # Con signo: positivo entra, negativo sale.
    quantity = models.IntegerField("cantidad")
    # Costo por unidad en pesos enteros al momento del movimiento.
    unit_cost = models.PositiveBigIntegerField("costo unitario")
    # Existencia que quedó después de este movimiento, para el kárdex.
    balance_after = models.PositiveIntegerField("existencia resultante")
    reason = models.CharField("motivo", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="inventory_movements",
        verbose_name="registrado por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = InventoryMovementManager()

    class Meta:
        verbose_name = "movimiento de inventario"
        verbose_name_plural = "movimientos de inventario"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(quantity=0), name="movement_quantity_not_zero",
                violation_error_message="La cantidad no puede ser cero.",
            ),
            models.CheckConstraint(
                condition=~Q(kind__in=INCOMING_KINDS) | Q(quantity__gt=0), name="movement_incoming_positive",
                violation_error_message="Este tipo de movimiento solo puede sumar unidades.",
            ),
            models.CheckConstraint(
                condition=~Q(kind__in=OUTGOING_KINDS) | Q(quantity__lt=0), name="movement_outgoing_negative",
                violation_error_message="Este tipo de movimiento solo puede restar unidades.",
            ),
            models.CheckConstraint(
                condition=~Q(kind=MovementKind.ADJUSTMENT) | ~Q(reason=""), name="movement_adjustment_reason",
                violation_error_message="El ajuste necesita un motivo.",
            ),
            models.UniqueConstraint(
                "product", condition=Q(kind=MovementKind.INITIAL_COUNT), name="movement_one_initial_count",
                violation_error_message="Este producto ya tiene su inventario inicial.",
            ),
        ]
        indexes = [models.Index(fields=["product", "-created_at"], name="movement_product_date_idx")]

    def __str__(self):
        return f"{self.get_kind_display()} {self.quantity:+d} · {self.product.code}"


class InitialCount(models.Model):
    """Estado del conteo físico con el que arranca el programa.

    Mientras está abierto se cargan los saldos iniciales y no se vende. El
    dueño lo termina una sola vez con una acción explícita. Hay un solo
    registro (pk=1) por instalación.
    """

    SINGLETON_PK = 1

    finished_at = models.DateTimeField("terminado", null=True, blank=True)
    finished_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+",
        verbose_name="terminado por",
    )

    class Meta:
        verbose_name = "inventario inicial"
        verbose_name_plural = "inventario inicial"
        constraints = [models.CheckConstraint(condition=Q(pk=1), name="initial_count_singleton")]

    def __str__(self):
        return "Inventario inicial terminado" if self.finished_at else "Inventario inicial abierto"

    @property
    def is_open(self):
        return self.finished_at is None

    @classmethod
    def load(cls):
        count, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return count
