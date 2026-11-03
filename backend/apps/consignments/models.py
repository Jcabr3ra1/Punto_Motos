from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import F, Q
from django.db.models.functions import Lower

from apps.cash.models import CashMovement, CashMovementKind, CashSession, CashSessionClosed
from apps.catalog.models import NamedModel, Product
from apps.core.models import PaymentMethod
from apps.inventory.models import InitialCount, InitialCountOpen, InventoryMovement, MovementKind


class EmptyDelivery(Exception):
    """Una entrega necesita al menos un producto."""


class EmptyReport(Exception):
    """Un reporte necesita al menos una unidad vendida o devuelta."""


class ExceedsConsigned(Exception):
    """El local reporta más unidades de las que todavía tiene de esa entrega."""

    def __init__(self, item, pending, requested):
        self.item = item
        self.pending = pending
        self.requested = requested
        super().__init__(f"{item.product.code}: le quedan {pending} y reporta {requested}.")


class Overpayment(Exception):
    """El pago supera lo que debe el local."""

    def __init__(self, balance_due, requested):
        self.balance_due = balance_due
        self.requested = requested
        super().__init__(f"Se deben {balance_due} y se pagan {requested}.")


class ConsignmentIsFinal(Exception):
    """Entregas, reportes y pagos ya movieron inventario o saldo: no se borran."""


class Consignee(NamedModel):
    """Otro local al que el dueño le deja mercancía en consignación."""

    tax_id = models.CharField("NIT o cédula", max_length=30, blank=True)
    phone = models.CharField("teléfono", max_length=30, blank=True)
    notes = models.CharField("notas", max_length=200, blank=True)
    # Pesos enteros: lo vendido que ha reportado menos lo que ha pagado. Solo
    # cambia con ConsignmentReport.objects.record() y ConsigneePayment.objects.record().
    balance_due = models.PositiveBigIntegerField("saldo", default=0, editable=False)

    class Meta(NamedModel.Meta):
        verbose_name = "local en consignación"
        verbose_name_plural = "locales en consignación"
        constraints = [models.UniqueConstraint(Lower("name"), name="consignee_name_unique")]

    def save(self, *args, **kwargs):
        # Al editar los datos del local no se escribe el saldo: una copia vieja
        # en memoria no debe pisar lo que sumaron reportes y pagos.
        if self.pk and kwargs.get("update_fields") is None and not kwargs.get("force_insert"):
            kwargs["update_fields"] = [
                field.attname for field in self._meta.concrete_fields if field.attname not in ("id", "balance_due")
            ]
        super().save(*args, **kwargs)


class ConsignmentDeliveryManager(models.Manager):
    def deliver(self, consignee, items, user, idempotency_key, notes=""):
        """Entrega mercancía al local: las unidades salen del inventario de la tienda.

        items es una lista como [{"product": producto, "quantity": 4,
        "unit_value": 19000}]. unit_value es lo que el local pagará por cada
        unidad que venda; si no llega, se toma el costo del producto. Un
        reintento con la misma idempotency_key devuelve la entrega ya hecha.
        Devuelve (entrega, creada). Si una existencia no alcanza, no queda nada.
        """
        existing = self.filter(idempotency_key=idempotency_key).first()
        if existing:
            return existing, False
        if InitialCount.load().is_open:
            raise InitialCountOpen()
        if not items:
            raise EmptyDelivery()
        products = [item["product"].pk for item in items]
        if len(products) != len(set(products)):
            raise ValidationError("Un producto está repetido en la entrega: cambia su cantidad.")

        lines = [
            ConsignmentItem(
                product=item["product"], quantity=item["quantity"],
                unit_value=item.get("unit_value", item["product"].cost_price), unit_cost=item["product"].cost_price,
            )
            for item in items
        ]
        try:
            with transaction.atomic():
                delivery = self.create(
                    consignee=consignee, idempotency_key=idempotency_key, notes=" ".join(notes.split()),
                    created_by=user,
                )
                reason = f"Consignación {delivery.pk} · {consignee.name}"
                for line in lines:
                    line.delivery = delivery
                    line.full_clean(exclude=["delivery"])
                    line.save()
                    InventoryMovement.objects.record(
                        line.product, MovementKind.CONSIGNMENT_OUT, -line.quantity, user,
                        unit_cost=line.unit_cost, reason=reason,
                    )
        except IntegrityError:
            existing = self.filter(idempotency_key=idempotency_key).first()
            if existing:
                return existing, False
            raise
        return delivery, True


class ConsignmentDelivery(models.Model):
    """Mercancía que el dueño le deja a otro local. No se edita ni se borra."""

    consignee = models.ForeignKey(
        Consignee, on_delete=models.PROTECT, related_name="deliveries", verbose_name="local",
    )
    idempotency_key = models.UUIDField("clave de reintento", unique=True, editable=False)
    notes = models.CharField("notas", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="consignment_deliveries",
        verbose_name="entregada por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = ConsignmentDeliveryManager()

    class Meta:
        verbose_name = "entrega en consignación"
        verbose_name_plural = "entregas en consignación"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"Consignación {self.pk} · {self.consignee}"

    def delete(self, *args, **kwargs):
        raise ConsignmentIsFinal()


class ConsignmentItem(models.Model):
    """Producto entregado y cómo va: cuántas vendió el local, cuántas devolvió y cuántas le quedan."""

    delivery = models.ForeignKey(
        ConsignmentDelivery, on_delete=models.CASCADE, related_name="items", verbose_name="entrega",
    )
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="consignment_items", verbose_name="producto",
    )
    quantity = models.PositiveIntegerField("cantidad entregada")
    # Pesos enteros por unidad: unit_value es lo pactado con el local (casi a
    # costo, no a precio de venta); unit_cost, el costo de la tienda ese día.
    unit_value = models.PositiveBigIntegerField("valor pactado")
    unit_cost = models.PositiveBigIntegerField("costo unitario")
    # Contadores que solo cambia ConsignmentReport.objects.record().
    sold_quantity = models.PositiveIntegerField("vendidas", default=0, editable=False)
    returned_quantity = models.PositiveIntegerField("devueltas", default=0, editable=False)

    class Meta:
        verbose_name = "producto en consignación"
        verbose_name_plural = "productos en consignación"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="consignment_item_quantity_positive",
                violation_error_message="La cantidad debe ser mayor que cero.",
            ),
            models.CheckConstraint(
                condition=Q(sold_quantity__lte=F("quantity") - F("returned_quantity")),
                name="consignment_item_within_delivered",
                violation_error_message="Vendidas más devueltas no pueden superar lo entregado.",
            ),
            models.UniqueConstraint(
                "delivery", "product", name="consignment_item_product_unique",
                violation_error_message="Este producto ya está en la entrega: cambia su cantidad.",
            ),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.product.code}"

    @property
    def pending_quantity(self):
        """Unidades que el local todavía tiene: ni vendidas ni devueltas."""
        return self.quantity - self.sold_quantity - self.returned_quantity


class ConsignmentReportManager(models.Manager):
    def record(self, consignee, lines, user, notes=""):
        """Registra lo que el local vendió y lo que devolvió.

        lines es una lista como [{"item": línea_de_entrega, "sold": 2,
        "returned": 1}]. Lo vendido se suma al saldo del local al valor pactado
        de esa entrega; lo devuelto vuelve al inventario. Reportar más de lo
        que le queda lanza ExceedsConsigned y no guarda nada.
        """
        lines = [line for line in lines if line.get("sold", 0) or line.get("returned", 0)]
        if not lines:
            raise EmptyReport()
        items = [line["item"].pk for line in lines]
        if len(items) != len(set(items)):
            raise ValidationError("Una línea de entrega está repetida en el reporte.")

        with transaction.atomic():
            report = self.create(consignee=consignee, notes=" ".join(notes.split()), created_by=user)
            reason = f"Reporte de consignación {report.pk} · {consignee.name}"
            total = 0
            for line in lines:
                item, sold, returned = line["item"], line.get("sold", 0), line.get("returned", 0)
                if item.delivery.consignee_id != consignee.pk:
                    raise ValueError("La entrega es de otro local.")
                # La base solo suma si al local todavía le quedan esas unidades.
                updated = ConsignmentItem.objects.filter(
                    pk=item.pk, quantity__gte=F("sold_quantity") + F("returned_quantity") + sold + returned,
                ).update(sold_quantity=F("sold_quantity") + sold, returned_quantity=F("returned_quantity") + returned)
                if not updated:
                    item.refresh_from_db()
                    raise ExceedsConsigned(item, pending=item.pending_quantity, requested=sold + returned)
                ConsignmentReportLine.objects.create(report=report, item=item, sold=sold, returned=returned)
                if returned:
                    InventoryMovement.objects.record(
                        item.product, MovementKind.CONSIGNMENT_RETURN, returned, user,
                        unit_cost=item.unit_cost, reason=reason,
                    )
                total += sold * item.unit_value
            report.total = total
            report.save(update_fields=["total"])
            Consignee.objects.filter(pk=consignee.pk).update(balance_due=F("balance_due") + total)
        consignee.refresh_from_db()
        return report


class ConsignmentReport(models.Model):
    """Lo que el local dijo que vendió y lo que devolvió en una visita. No se edita ni se borra."""

    consignee = models.ForeignKey(Consignee, on_delete=models.PROTECT, related_name="reports", verbose_name="local")
    # Pesos enteros: lo vendido al valor pactado, que pasa al saldo del local.
    total = models.PositiveBigIntegerField("total vendido", default=0)
    notes = models.CharField("notas", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="consignment_reports",
        verbose_name="registrado por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = ConsignmentReportManager()

    class Meta:
        verbose_name = "reporte de consignación"
        verbose_name_plural = "reportes de consignación"
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"Reporte {self.pk} · {self.consignee}"

    def delete(self, *args, **kwargs):
        raise ConsignmentIsFinal()


class ConsignmentReportLine(models.Model):
    report = models.ForeignKey(ConsignmentReport, on_delete=models.CASCADE, related_name="lines", verbose_name="reporte")
    item = models.ForeignKey(
        ConsignmentItem, on_delete=models.PROTECT, related_name="report_lines", verbose_name="producto entregado",
    )
    sold = models.PositiveIntegerField("vendidas", default=0)
    returned = models.PositiveIntegerField("devueltas", default=0)

    class Meta:
        verbose_name = "línea del reporte"
        verbose_name_plural = "líneas del reporte"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(condition=Q(sold__gt=0) | Q(returned__gt=0), name="consignment_line_not_empty"),
            models.UniqueConstraint("report", "item", name="consignment_line_item_unique"),
        ]

    def __str__(self):
        return f"{self.item.product.code}: {self.sold} vendidas, {self.returned} devueltas"


class ConsigneePaymentManager(models.Manager):
    def record(self, consignee, amount, method, user, notes=""):
        """Registra un pago del local, le baja el saldo y lo suma a la caja abierta.

        Pagar más de lo que debe lanza Overpayment; sin caja abierta, CashSessionClosed.
        """
        payment = self.model(
            consignee=consignee, amount=amount, method=method, created_by=user, notes=" ".join(notes.split()),
        )
        payment.full_clean()
        if CashSession.objects.current() is None:
            raise CashSessionClosed()
        with transaction.atomic():
            # La base solo resta si el saldo alcanza: dos pagos al tiempo no lo dejan en negativo.
            updated = Consignee.objects.filter(pk=consignee.pk, balance_due__gte=amount).update(
                balance_due=F("balance_due") - amount,
            )
            consignee.refresh_from_db()
            if not updated:
                raise Overpayment(consignee.balance_due, requested=amount)
            payment.save()
            CashMovement.objects.record(
                CashMovementKind.CONSIGNEE_PAYMENT, amount, method, user,
                reason=f"Pago de {consignee.name}", consignee_payment=payment,
            )
        return payment


class ConsigneePayment(models.Model):
    """Dinero que paga el local por lo que vendió. Abona al saldo, no a un reporte en particular."""

    consignee = models.ForeignKey(Consignee, on_delete=models.PROTECT, related_name="payments", verbose_name="local")
    amount = models.PositiveBigIntegerField("valor")
    method = models.CharField("medio de pago", max_length=10, choices=PaymentMethod.choices)
    notes = models.CharField("notas", max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="consignee_payments",
        verbose_name="registrado por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = ConsigneePaymentManager()

    class Meta:
        verbose_name = "pago de local en consignación"
        verbose_name_plural = "pagos de locales en consignación"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="consignee_payment_amount_positive",
                violation_error_message="El valor debe ser mayor que cero.",
            ),
        ]

    def __str__(self):
        return f"{self.get_method_display()} {self.amount} · {self.consignee}"

    def delete(self, *args, **kwargs):
        raise ConsignmentIsFinal()
