from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import Max, Q
from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind, CashSession, CashSessionClosed
from apps.catalog.models import NamedModel, Product
from apps.core.models import PaymentMethod
from apps.inventory.models import InitialCount, InitialCountOpen, InventoryMovement, MovementKind


class EmptySale(Exception):
    """Una venta necesita al menos un producto."""


class PriceChangeNotAllowed(Exception):
    """Solo el dueño puede vender a un precio distinto al del catálogo."""

    def __init__(self, product, list_price, requested):
        self.product = product
        self.list_price = list_price
        self.requested = requested
        super().__init__(f"{product.code}: el catálogo dice {list_price} y se piden {requested}.")


class SaleIsFinal(Exception):
    """Una venta confirmada no se borra: se corrige con una anulación o una devolución."""


class SaleAlreadyVoided(Exception):
    """La venta ya se anuló: no se anula dos veces."""


class PaymentMismatch(Exception):
    """Las ventas no se dan a crédito: lo pagado debe ser exactamente el total."""

    def __init__(self, total, paid):
        self.total = total
        self.paid = paid
        super().__init__(f"La venta es de {total} y se pagan {paid}.")


class Customer(NamedModel):
    """Cliente de la venta. El nombre es obligatorio y el contacto opcional.

    El nombre no es único: puede haber dos «Juan Pérez». Para no duplicarlos,
    la pantalla de venta sugiere los clientes anteriores al escribir.
    """

    phone = models.CharField("teléfono", max_length=30, blank=True)
    notes = models.CharField("notas", max_length=200, blank=True)

    class Meta(NamedModel.Meta):
        verbose_name = "cliente"
        verbose_name_plural = "clientes"
        indexes = [models.Index(fields=["search_name"], name="customer_search_name_idx")]


class SaleManager(models.Manager):
    def confirm(self, customer, items, payments, user, idempotency_key, notes=""):
        """Registra una venta confirmada: líneas, salidas de inventario y cobros, todo junto.

        items es una lista como [{"product": producto, "quantity": 2}]; cada
        línea toma el precio y el costo del catálogo en ese momento. Solo el
        dueño puede mandar "unit_price" distinto. payments es el pago, uno por
        medio: [{"amount": 30000, "method": "cash"}, {"amount": 10000,
        "method": "transfer"}]. No hay ventas a crédito: los pagos deben sumar
        exactamente el total (PaymentMismatch); el vuelto lo calcula la ventana.

        idempotency_key es un UUID que genera la ventana por cada venta: si
        llega otra vez (doble clic o reintento) se devuelve la venta ya hecha
        sin repetir nada. Devuelve (venta, creada).

        Cada pago entra a la caja abierta; sin caja lanza CashSessionClosed.
        Si una existencia no alcanza (InsufficientStock), el precio no está
        permitido o el pago no cuadra, no queda nada guardado.
        """
        existing = self.filter(idempotency_key=idempotency_key).first()
        if existing:
            return existing, False
        if InitialCount.load().is_open:
            raise InitialCountOpen()
        if CashSession.objects.current() is None:
            raise CashSessionClosed()
        if not items:
            raise EmptySale()

        products = [item["product"].pk for item in items]
        if len(products) != len(set(products)):
            raise ValidationError("Un producto está repetido en la venta: cambia su cantidad.")

        lines = []
        for item in items:
            product = item["product"]
            unit_price = item.get("unit_price", product.sale_price)
            if unit_price != product.sale_price and not user.is_owner:
                raise PriceChangeNotAllowed(product, product.sale_price, unit_price)
            lines.append(SaleItem(
                product=product, description=f"{product.code} · {product.name}", quantity=item["quantity"],
                list_price=product.sale_price, unit_price=unit_price, unit_cost=product.cost_price,
            ))
        total = sum(line.subtotal for line in lines)
        paid = sum(payment["amount"] for payment in payments)
        if paid != total:
            raise PaymentMismatch(total, paid)

        try:
            with transaction.atomic():
                number = (self.aggregate(last=Max("number"))["last"] or 0) + 1
                sale = self.create(
                    number=number, customer=customer, total=total, idempotency_key=idempotency_key,
                    notes=" ".join(notes.split()), created_by=user,
                )
                reason = f"Venta {number} · {customer.name}"
                for line in lines:
                    line.sale = sale
                    line.full_clean(exclude=["sale"])
                    line.save()
                    InventoryMovement.objects.record(
                        line.product, MovementKind.SALE, -line.quantity, user, unit_cost=line.unit_cost, reason=reason,
                    )
                for payment in payments:
                    line = SalePayment(sale=sale, **payment)
                    line.full_clean(exclude=["sale"])
                    line.save()
                    CashMovement.objects.record(
                        CashMovementKind.SALE, line.amount, line.method, user, reason=reason, sale=sale,
                    )
        except IntegrityError:
            # Dos peticiones con la misma clave al tiempo: la otra ganó, se devuelve la suya.
            existing = self.filter(idempotency_key=idempotency_key).first()
            if existing:
                return existing, False
            raise
        sale.refresh_from_db()
        return sale, True


class Sale(models.Model):
    """Venta de mostrador ya confirmada.

    Nace completa con Sale.objects.confirm(): no hay borrador en el backend,
    el carrito vive en la ventana hasta que se cobra. Se paga completa al
    venderla: no hay ventas a crédito. Un error se corrige anulándola
    (void), que no la borra: deja las operaciones contrarias.
    """

    # Número visible del recibo, consecutivo. El id es interno.
    number = models.PositiveIntegerField("número", unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="sales", verbose_name="cliente")
    # Pesos enteros.
    total = models.PositiveBigIntegerField("total")
    # Clave que manda la ventana para que un reintento no cree otra venta.
    idempotency_key = models.UUIDField("clave de reintento", unique=True, editable=False)
    notes = models.CharField("notas", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sales", verbose_name="vendida por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)
    voided_at = models.DateTimeField("anulada", null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="sales_voided",
        verbose_name="anulada por",
    )
    void_reason = models.CharField("motivo de la anulación", max_length=200, blank=True)

    objects = SaleManager()

    class Meta:
        verbose_name = "venta"
        verbose_name_plural = "ventas"
        ordering = ["-number"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(voided_at__isnull=True, voided_by__isnull=True, void_reason="")
                    | (Q(voided_at__isnull=False, voided_by__isnull=False) & ~Q(void_reason=""))
                ),
                name="sale_voided_complete",
            ),
        ]

    def __str__(self):
        return f"Venta {self.number} · {self.customer}"

    @property
    def is_voided(self):
        return self.voided_at is not None

    def delete(self, *args, **kwargs):
        raise SaleIsFinal()

    def void(self, user, reason):
        """Anula la venta: las unidades vuelven al inventario y el dinero sale de la caja abierta.

        Cada pago se reembolsa por el mismo medio con que entró. La venta queda
        con su historial y marcada como anulada. Sin motivo lanza
        ValidationError; sin caja abierta, CashSessionClosed; una segunda vez,
        SaleAlreadyVoided. Si algo falla no queda nada.
        """
        reason = " ".join(reason.split())
        if not reason:
            raise ValidationError({"reason": "Indica por qué se anula la venta."})
        if CashSession.objects.current() is None:
            raise CashSessionClosed()
        with transaction.atomic():
            voided = Sale.objects.filter(pk=self.pk, voided_at__isnull=True).update(
                voided_at=timezone.now(), voided_by=user, void_reason=reason,
            )
            if not voided:
                raise SaleAlreadyVoided()
            note = f"Anulación venta {self.number} · {reason}"
            for item in self.items.select_related("product"):
                InventoryMovement.objects.record(
                    item.product, MovementKind.RETURN, item.quantity, user, unit_cost=item.unit_cost, reason=note,
                )
            for payment in self.payments.all():
                CashMovement.objects.record(
                    CashMovementKind.SALE_REFUND, -payment.amount, payment.method, user, reason=note, sale=self,
                )
        self.refresh_from_db()


class SaleItem(models.Model):
    """Producto vendido, con el precio y el costo de ese momento.

    Cambiar el catálogo después no altera las ventas anteriores.
    """

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items", verbose_name="venta")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_items", verbose_name="producto")
    # Código y nombre como se imprimieron en el recibo.
    description = models.CharField("descripción", max_length=200)
    quantity = models.PositiveIntegerField("cantidad")
    # Pesos enteros por unidad. list_price es el del catálogo; unit_price, el cobrado.
    list_price = models.PositiveBigIntegerField("precio de catálogo")
    unit_price = models.PositiveBigIntegerField("precio de venta")
    unit_cost = models.PositiveBigIntegerField("costo unitario")

    class Meta:
        verbose_name = "producto de la venta"
        verbose_name_plural = "productos de la venta"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="sale_item_quantity_positive",
                violation_error_message="La cantidad debe ser mayor que cero.",
            ),
            models.UniqueConstraint(
                "sale", "product", name="sale_item_product_unique",
                violation_error_message="Este producto ya está en la venta: cambia su cantidad.",
            ),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.description}"

    @property
    def subtotal(self):
        return self.quantity * self.unit_price

    @property
    def price_changed(self):
        """El dueño cambió el precio en esta venta: el recibo y los reportes lo muestran."""
        return self.unit_price != self.list_price


class SalePayment(models.Model):
    """Parte del pago de una venta en un medio. Pagar con efectivo y transferencia son dos registros."""

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments", verbose_name="venta")
    method = models.CharField("medio de pago", max_length=10, choices=PaymentMethod.choices)
    # Pesos enteros: lo que se aplica a la venta, sin el vuelto.
    amount = models.PositiveBigIntegerField("valor")

    class Meta:
        verbose_name = "pago de la venta"
        verbose_name_plural = "pagos de la venta"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="sale_payment_amount_positive",
                violation_error_message="El valor debe ser mayor que cero.",
            ),
            models.UniqueConstraint(
                "sale", "method", name="sale_payment_method_unique",
                violation_error_message="Este medio ya está en el pago: suma los valores.",
            ),
        ]

    def __str__(self):
        return f"{self.get_method_display()} {self.amount} · venta {self.sale_id}"
