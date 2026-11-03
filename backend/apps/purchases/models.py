from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q, Sum
from django.db.models.functions import Lower
from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind
from apps.catalog.models import NamedModel, PriceChange, Product
from apps.core.models import PaymentMethod, PaymentStatus  # noqa: F401 (se importan desde aquí)
from apps.inventory.models import InventoryBalance, InventoryMovement, MovementKind


class PurchaseNotDraft(Exception):
    """La compra ya se recibió: no se edita, no se borra ni se recibe otra vez."""


class EmptyPurchase(Exception):
    """Una compra sin productos no se puede recibir."""


class PurchaseNotReceived(Exception):
    """Solo se paga una compra recibida: antes su total todavía puede cambiar."""


class Overpayment(Exception):
    """El abono supera lo que se debe: al proveedor en total o a la compra elegida."""

    def __init__(self, balance_due, requested):
        self.balance_due = balance_due
        self.requested = requested
        super().__init__(f"Se deben {balance_due} y se abonan {requested}.")


def weighted_average_cost(stock, current_cost, quantity, unit_cost):
    """Costo promedio ponderado en pesos enteros, redondeado al peso más cercano.

    5 unidades a 18.000 + 3 a 20.000 -> (90.000 + 60.000) / 8 = 18.750.
    Sin existencias, el costo nuevo es el de la compra.
    """
    if stock <= 0:
        return unit_cost
    average = Decimal(stock * current_cost + quantity * unit_cost) / Decimal(stock + quantity)
    return int(average.quantize(Decimal(1), rounding=ROUND_HALF_UP))


# Los precios de venta que sube el sistema quedan cerrados en miles.
PRICE_ROUNDING = 1000


def raised_sale_price(sale_price, old_cost, new_cost):
    """Precio de venta cuando sube el costo: conserva la ganancia en pesos y cierra en mil hacia arriba.

    Venta 25.000 y costo de 18.000 a 18.750 -> 25.750 -> 26.000.
    Si el costo no sube, el precio queda igual: bajarlo es decisión del dueño.
    """
    if new_cost <= old_cost:
        return sale_price
    raised = sale_price + (new_cost - old_cost)
    return -(-raised // PRICE_ROUNDING) * PRICE_ROUNDING


class Supplier(NamedModel):
    """Proveedor al que se le compra mercancía."""

    tax_id = models.CharField("NIT o cédula", max_length=30, blank=True)
    phone = models.CharField("teléfono", max_length=30, blank=True)
    notes = models.CharField("notas", max_length=200, blank=True)

    class Meta(NamedModel.Meta):
        verbose_name = "proveedor"
        verbose_name_plural = "proveedores"
        constraints = [models.UniqueConstraint(Lower("name"), name="supplier_name_unique")]

    @property
    def balance_due(self):
        """Lo que se le debe en total: la suma de los saldos de sus compras recibidas."""
        result = self.purchases.filter(status=PurchaseStatus.RECEIVED).aggregate(
            due=Sum(F("total") - F("paid_amount")),
        )
        return result["due"] or 0


class PurchaseStatus(models.TextChoices):
    DRAFT = "draft", "Borrador"
    RECEIVED = "received", "Recibida"


class Purchase(models.Model):
    """Compra a un proveedor.

    En borrador se edita libremente y no toca el inventario. Al recibirla
    (receive) entran las existencias, se actualiza el costo de cada producto
    y su total queda fijo. Desde entonces solo se le registran pagos.
    """

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases", verbose_name="proveedor")
    # Número de la factura o remisión del proveedor, para buscarla y no cargarla dos veces.
    document_number = models.CharField("documento del proveedor", max_length=40, blank=True)
    status = models.CharField("estado", max_length=10, choices=PurchaseStatus.choices, default=PurchaseStatus.DRAFT)
    notes = models.CharField("notas", max_length=200, blank=True)
    # Pesos enteros. Ambos quedan en 0 mientras es borrador; total se fija al recibir.
    total = models.PositiveBigIntegerField("total", default=0)
    paid_amount = models.PositiveBigIntegerField("pagado", default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="purchases_created", verbose_name="creada por",
    )
    created_at = models.DateTimeField("creada", auto_now_add=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="purchases_received",
        verbose_name="recibida por",
    )
    received_at = models.DateTimeField("recibida", null=True, blank=True)

    class Meta:
        verbose_name = "compra"
        verbose_name_plural = "compras"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                "supplier", Lower("document_number"), condition=~Q(document_number=""),
                name="purchase_document_unique",
                violation_error_message="Ya hay una compra de este proveedor con ese documento.",
            ),
            models.CheckConstraint(
                condition=Q(paid_amount__lte=F("total")), name="purchase_paid_within_total",
                violation_error_message="Lo pagado no puede superar el total.",
            ),
            models.CheckConstraint(
                condition=Q(status=PurchaseStatus.RECEIVED) | Q(total=0, paid_amount=0, received_at__isnull=True),
                name="purchase_draft_has_no_totals",
            ),
            models.CheckConstraint(
                condition=Q(status=PurchaseStatus.DRAFT) | Q(received_at__isnull=False, received_by__isnull=False),
                name="purchase_received_has_date",
            ),
        ]

    def __str__(self):
        return f"Compra {self.pk} · {self.supplier}"

    @property
    def is_draft(self):
        return self.status == PurchaseStatus.DRAFT

    @property
    def items_total(self):
        """Suma de las líneas. En borrador es el total que tendría al recibirla."""
        return sum(item.subtotal for item in self.items.all())

    @property
    def balance_due(self):
        return self.total - self.paid_amount

    @property
    def payment_status(self):
        """None en borrador: todavía no se le debe nada al proveedor."""
        if self.is_draft:
            return None
        if self.paid_amount == 0 and self.total > 0:
            return PaymentStatus.PENDING
        if self.paid_amount < self.total:
            return PaymentStatus.PARTIAL
        return PaymentStatus.PAID

    def save(self, *args, **kwargs):
        self.document_number = " ".join(self.document_number.split())
        self.notes = " ".join(self.notes.split())
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        # Una compra recibida ya movió el inventario: no se borra.
        if not self.is_draft:
            raise PurchaseNotDraft()
        return super().delete(*args, **kwargs)

    def receive(self, user, payment=None):
        """Recibe la compra completa: entradas de inventario, costo promedio y total fijo.

        Si el costo de un producto sube, su precio de venta sube lo mismo
        (redondeado a mil) y el cambio queda en el historial de precios; si
        baja, el precio no se toca. Devuelve los cambios de precio hechos.

        payment es un abono opcional que se entrega con la mercancía, como
        {"amount": 50000, "method": "cash"}; se aplica a esta compra. Todo
        ocurre en una transacción: si un producto o el abono fallan no queda
        nada. Un segundo intento (doble clic) lanza PurchaseNotDraft sin
        repetir entradas.
        """
        with transaction.atomic():
            items = list(self.items.select_related("product"))
            if not items:
                raise EmptyPurchase()
            # Cambio condicional: solo una petición puede pasar la compra de borrador a recibida.
            received = Purchase.objects.filter(pk=self.pk, status=PurchaseStatus.DRAFT).update(
                status=PurchaseStatus.RECEIVED, total=sum(item.subtotal for item in items),
                received_by=user, received_at=timezone.now(),
            )
            if not received:
                raise PurchaseNotDraft()

            reason = f"Compra {self.pk} · {self.supplier.name}"
            price_changes = []
            for item in items:
                product = item.product
                stock = InventoryBalance.objects.filter(product=product).values_list("quantity", flat=True).first() or 0
                old_cost = product.cost_price
                product.cost_price = weighted_average_cost(stock, old_cost, item.quantity, item.unit_cost)
                new_price = raised_sale_price(product.sale_price, old_cost, product.cost_price)
                if new_price != product.sale_price:
                    price_changes.append(PriceChange(
                        product=product, old_price=product.sale_price, new_price=new_price,
                        reason=reason, changed_by=user,
                    ))
                    product.sale_price = new_price
                product.save(update_fields=["cost_price", "sale_price", "updated_at"])
                InventoryMovement.objects.record(
                    product, MovementKind.PURCHASE, item.quantity, user, unit_cost=item.unit_cost, reason=reason,
                )
            PriceChange.objects.bulk_create(price_changes)
            if payment:
                SupplierPayment.objects.record(self.supplier, user=user, purchase=self, **payment)
        self.refresh_from_db()
        return price_changes


class PurchaseItem(models.Model):
    """Producto de una compra con la cantidad y el costo por unidad que cobró el proveedor."""

    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items", verbose_name="compra")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="purchase_items", verbose_name="producto")
    quantity = models.PositiveIntegerField("cantidad")
    # Pesos enteros por unidad. Puede ser 0 si el proveedor la regala.
    unit_cost = models.PositiveBigIntegerField("costo unitario")

    class Meta:
        verbose_name = "producto de la compra"
        verbose_name_plural = "productos de la compra"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="purchase_item_quantity_positive",
                violation_error_message="La cantidad debe ser mayor que cero.",
            ),
            models.UniqueConstraint(
                "purchase", "product", name="purchase_item_product_unique",
                violation_error_message="Este producto ya está en la compra: cambia su cantidad.",
            ),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.product.code}"

    @property
    def subtotal(self):
        return self.quantity * self.unit_cost


class SupplierPaymentManager(models.Manager):
    def record(self, supplier, amount, method, user, purchase=None, paid_on=None, notes=""):
        """Registra un abono al proveedor y lo reparte entre sus compras con saldo.

        Sin purchase, el abono paga primero las compras más antiguas; con
        purchase, se aplica solo a esa. Un abono mayor que lo que se debe
        lanza Overpayment; uno a una compra en borrador, PurchaseNotReceived.
        En ambos casos no queda nada guardado.

        Un abono de hoy sale de la caja abierta (sin caja, CashSessionClosed).
        Uno con fecha anterior se pagó por fuera y no toca la caja de hoy.
        """
        if purchase is not None and purchase.supplier_id != supplier.pk:
            raise ValueError("La compra es de otro proveedor.")
        payment = self.model(
            supplier=supplier, amount=amount, method=method, created_by=user,
            paid_on=paid_on or timezone.localdate(), notes=" ".join(notes.split()),
        )
        payment.full_clean()

        with transaction.atomic():
            if purchase is not None:
                purchase.refresh_from_db()
                if purchase.is_draft:
                    raise PurchaseNotReceived()
                targets = [purchase]
            else:
                targets = list(
                    supplier.purchases.filter(status=PurchaseStatus.RECEIVED, paid_amount__lt=F("total"))
                    .order_by("received_at", "id"),
                )
            balance_due = sum(target.balance_due for target in targets)
            if amount > balance_due:
                raise Overpayment(balance_due, requested=amount)

            payment.save()
            remaining = amount
            for target in targets:
                if remaining == 0:
                    break
                applied = min(remaining, target.balance_due)
                # La base solo suma si el saldo todavía alcanza: si otro abono se
                # adelantó, todo se deshace y no se paga de más.
                updated = Purchase.objects.filter(pk=target.pk, paid_amount__lte=F("total") - applied).update(
                    paid_amount=F("paid_amount") + applied,
                )
                if not updated:
                    raise Overpayment(supplier.balance_due, requested=amount)
                PaymentAllocation.objects.create(payment=payment, purchase=target, amount=applied)
                remaining -= applied
            if payment.paid_on == timezone.localdate():
                CashMovement.objects.record(
                    CashMovementKind.SUPPLIER_PAYMENT, -amount, method, user,
                    reason=f"Abono a {supplier.name}", supplier_payment=payment,
                )

        if purchase is not None:
            purchase.refresh_from_db()
        return payment


class SupplierPayment(models.Model):
    """Abono al proveedor. No se edita ni se borra.

    Puede cubrir una compra, parte de ella o varias a la vez: el reparto
    queda en PaymentAllocation.
    """

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="payments", verbose_name="proveedor")
    amount = models.PositiveBigIntegerField("valor")
    method = models.CharField("medio de pago", max_length=10, choices=PaymentMethod.choices)
    # Día en que se pagó, que puede ser anterior al día en que se registra.
    paid_on = models.DateField("fecha de pago")
    notes = models.CharField("notas", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="supplier_payments", verbose_name="registrado por",
    )
    created_at = models.DateTimeField("registrado", auto_now_add=True)

    objects = SupplierPaymentManager()

    class Meta:
        verbose_name = "abono a proveedor"
        verbose_name_plural = "abonos a proveedores"
        ordering = ["-paid_on", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="supplier_payment_amount_positive",
                violation_error_message="El valor debe ser mayor que cero.",
            ),
        ]

    def __str__(self):
        return f"{self.get_method_display()} {self.amount} · {self.supplier}"

    def clean(self):
        if self.paid_on and self.paid_on > timezone.localdate():
            raise ValidationError({"paid_on": "La fecha de pago no puede ser futura."})


class PaymentAllocation(models.Model):
    """Parte de un abono que se aplicó a una compra."""

    payment = models.ForeignKey(
        SupplierPayment, on_delete=models.CASCADE, related_name="allocations", verbose_name="abono",
    )
    purchase = models.ForeignKey(Purchase, on_delete=models.PROTECT, related_name="allocations", verbose_name="compra")
    amount = models.PositiveBigIntegerField("valor aplicado")

    class Meta:
        verbose_name = "aplicación de abono"
        verbose_name_plural = "aplicaciones de abonos"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="payment_allocation_amount_positive"),
            models.UniqueConstraint("payment", "purchase", name="payment_allocation_unique"),
        ]

    def __str__(self):
        return f"{self.amount} · compra {self.purchase_id}"
