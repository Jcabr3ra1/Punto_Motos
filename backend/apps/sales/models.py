from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import F, Max, Q
from django.utils import timezone

from apps.cash.models import CashMovement, CashMovementKind, CashSession, CashSessionClosed
from apps.catalog.models import NamedModel, Product
from apps.core.models import PaymentMethod
from apps.inventory.models import InitialCount, InitialCountOpen, InventoryMovement, MovementKind
from apps.workshop.models import Mechanic, MechanicDeduction, MechanicSettlement, ServiceType


class EmptySale(Exception):
    """Una venta necesita al menos un producto o un servicio."""


class PriceChangeNotAllowed(Exception):
    """Solo el dueño puede vender a un precio distinto al del catálogo."""

    def __init__(self, product, list_price, requested):
        self.product = product
        self.list_price = list_price
        self.requested = requested
        super().__init__(f"{product.code}: el catálogo dice {list_price} y se piden {requested}.")


class LaborPriceChangeNotAllowed(Exception):
    """Solo el dueño puede cobrar un servicio a un valor distinto del sugerido."""

    def __init__(self, service_type, suggested_price, requested):
        self.service_type = service_type
        self.suggested_price = suggested_price
        self.requested = requested
        super().__init__(f"{service_type}: el sugerido es {suggested_price} y se piden {requested}.")


class SaleIsFinal(Exception):
    """Una venta confirmada no se borra: se corrige con una anulación o una devolución."""


class SaleAlreadyVoided(Exception):
    """La venta ya se anuló: no se anula dos veces."""


class SaleHasSettledServices(Exception):
    """Un servicio de la venta ya se le pagó al mecánico: se corrige con una devolución, no anulando."""


class SaleHasReturns(Exception):
    """La venta ya tiene devoluciones: anularla reembolsaría dos veces ese dinero."""


class PaymentMismatch(Exception):
    """Las ventas no se dan a crédito: lo pagado debe ser exactamente el total."""

    def __init__(self, total, paid):
        self.total = total
        self.paid = paid
        super().__init__(f"La venta es de {total} y se pagan {paid}.")


class EmptyReturn(Exception):
    """Una devolución necesita al menos un producto o un servicio."""


class BadServiceOwnerOnly(Exception):
    """Solo el dueño registra una devolución con causa de mal servicio."""


class ReturnExceedsSold(Exception):
    """No se puede devolver más de lo vendido menos lo ya devuelto."""

    def __init__(self, item, available, requested):
        self.item = item
        self.available = available
        self.requested = requested
        super().__init__(f"{item.description}: se pueden devolver {available} y se piden {requested}.")


class ServiceAlreadyReturned(Exception):
    """Un servicio se devuelve completo y una sola vez."""

    def __init__(self, service):
        self.service = service
        super().__init__(f"El servicio {service} ya se devolvió.")


class RefundMismatch(Exception):
    """El reembolso debe ser exactamente el valor de lo devuelto."""

    def __init__(self, total, refunded):
        self.total = total
        self.refunded = refunded
        super().__init__(f"La devolución es de {total} y se reembolsan {refunded}.")


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
    def confirm(self, customer, items, payments, user, idempotency_key, notes="", services=()):
        """Registra una venta confirmada: líneas, salidas de inventario y cobros, todo junto.

        items es una lista como [{"product": producto, "quantity": 2}]; cada
        línea toma el precio y el costo del catálogo en ese momento. Solo el
        dueño puede mandar "unit_price" distinto. payments es el pago, uno por
        medio: [{"amount": 30000, "method": "cash"}, {"amount": 10000,
        "method": "transfer"}]. No hay ventas a crédito: los pagos deben sumar
        exactamente el total (PaymentMismatch); el vuelto lo calcula la ventana.

        customer es opcional: con None, la venta queda sin cliente.

        services son los servicios del taller, cada uno con su mecánico:
        [{"service_type": tipo, "mechanic": mecánico, "details": "..."}]. El valor de la mano de obra es el sugerido del tipo;
        solo el dueño puede mandar "labor_price" distinto
        (LaborPriceChangeNotAllowed). Los repuestos usados van en items como
        cualquier producto. Una venta puede ser solo de servicios.

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
        if not items and not services:
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
        service_lines = []
        for service in services:
            service_type = service["service_type"]
            labor_price = service.get("labor_price", service_type.suggested_price)
            if labor_price != service_type.suggested_price and not user.is_owner:
                raise LaborPriceChangeNotAllowed(service_type, service_type.suggested_price, labor_price)
            line = SaleService(
                service_type=service_type, mechanic=service["mechanic"], details=service.get("details", ""),
                suggested_price=service_type.suggested_price, labor_price=labor_price,
            )
            line.clean()
            line.clean_fields(exclude=["sale"])
            service_lines.append(line)

        total = sum(line.subtotal for line in lines) + sum(line.labor_price for line in service_lines)
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
                reason = f"Venta {number} · {customer.name}" if customer else f"Venta {number}"
                for line in lines:
                    line.sale = sale
                    line.full_clean(exclude=["sale"])
                    line.save()
                    InventoryMovement.objects.record(
                        line.product, MovementKind.SALE, -line.quantity, user, unit_cost=line.unit_cost, reason=reason,
                    )
                for line in service_lines:
                    line.sale = sale
                    line.save()
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
    # Opcional: en mostrador no siempre se pide el nombre.
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, null=True, blank=True, related_name="sales", verbose_name="cliente",
    )
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
        return f"Venta {self.number} · {self.customer}" if self.customer else f"Venta {self.number}"

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
        SaleAlreadyVoided. Si algún servicio ya se liquidó al mecánico lanza
        SaleHasSettledServices: ese dinero ya salió y se maneja con una
        devolución. Si ya tiene devoluciones lanza SaleHasReturns. Si algo falla
        no queda nada.
        """
        reason = " ".join(reason.split())
        if not reason:
            raise ValidationError({"reason": "Indica por qué se anula la venta."})
        if CashSession.objects.current() is None:
            raise CashSessionClosed()
        with transaction.atomic():
            if self.services.filter(settlement__isnull=False).exists():
                raise SaleHasSettledServices()
            if self.returns.exists():
                raise SaleHasReturns()
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
    # Unidades ya devueltas. Solo cambia con SaleReturn.objects.register().
    returned_quantity = models.PositiveIntegerField("cantidad devuelta", default=0)

    class Meta:
        verbose_name = "producto de la venta"
        verbose_name_plural = "productos de la venta"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="sale_item_quantity_positive",
                violation_error_message="La cantidad debe ser mayor que cero.",
            ),
            models.CheckConstraint(
                condition=Q(returned_quantity__lte=F("quantity")), name="sale_item_returned_within_quantity",
                violation_error_message="No se puede devolver más de lo vendido.",
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


class SaleService(models.Model):
    """Servicio del taller cobrado en la venta, con el mecánico que lo hizo.

    Se registra cuando el trabajo ya está hecho, con el valor acordado con el
    cliente: no hay orden de trabajo ni estados. La mano de obra se reparte
    entre el mecánico y el local en la liquidación diaria; los repuestos van
    como productos de la misma venta y son 100 % del local.
    """

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="services", verbose_name="venta")
    service_type = models.ForeignKey(
        ServiceType, on_delete=models.PROTECT, related_name="sale_services", verbose_name="tipo de servicio",
    )
    mechanic = models.ForeignKey(Mechanic, on_delete=models.PROTECT, related_name="services", verbose_name="mecánico")
    # Qué se hizo, en pocas palabras. Opcional.
    details = models.CharField("descripción", max_length=120, blank=True)
    # Pesos enteros. suggested_price es el del tipo de servicio en ese momento; labor_price, el cobrado.
    suggested_price = models.PositiveBigIntegerField("precio sugerido")
    labor_price = models.PositiveBigIntegerField("mano de obra")
    # Liquidación en que se le pagó al mecánico. Vacío: todavía no se le ha pagado.
    settlement = models.ForeignKey(
        MechanicSettlement, on_delete=models.PROTECT, null=True, blank=True, related_name="services",
        verbose_name="liquidación",
    )

    class Meta:
        verbose_name = "servicio de la venta"
        verbose_name_plural = "servicios de la venta"
        ordering = ["id"]
        indexes = [models.Index(fields=["mechanic", "sale"], name="sale_service_mechanic_idx")]

    def __str__(self):
        return f"{self.service_type.name} · {self.mechanic}"

    def clean(self):
        self.details = " ".join(self.details.split())
        errors = {}
        if self.service_type_id and not self.service_type.is_active:
            errors["service_type"] = "Este tipo de servicio está desactivado."
        if self.mechanic_id and not self.mechanic.is_active:
            errors["mechanic"] = "Este mecánico está desactivado."
        if errors:
            raise ValidationError(errors)

    @property
    def price_changed(self):
        """El dueño cobró un valor distinto del sugerido."""
        return self.labor_price != self.suggested_price


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


class ReturnCause(models.TextChoices):
    BAD_SERVICE = "bad_service", "Mal servicio del mecánico"
    OTHER = "other", "Otra causa"


class ReturnCondition(models.TextChoices):
    RESELLABLE = "resellable", "Vuelve al inventario"
    DAMAGED = "damaged", "No puede volver"


class SaleReturnManager(models.Manager):
    def register(self, sale, cause, reason, user, idempotency_key, items=(), services=(), refunds=()):
        """Registra una devolución: reingresa lo que sirve, reembolsa y, si aplica, descuenta al mecánico.

        items es una lista como [{"sale_item": línea, "quantity": 1, "condition":
        "resellable"}]. Las unidades "resellable" vuelven al inventario; las
        "damaged" ya habían salido con la venta, así que la existencia no cambia
        y solo quedan anotadas. services es una lista de líneas SaleService: se
        devuelven completas y una sola vez. refunds es el reembolso, uno por
        medio: [{"method": "cash", "amount": 15000}], y debe sumar exactamente el
        valor de lo devuelto (RefundMismatch).

        Con causa "bad_service" solo la registra el dueño (BadServiceOwnerOnly) y
        debe incluir servicios de un solo mecánico. A ese mecánico se le
        descuenta la mano de obra devuelta completa más los repuestos "damaged",
        al precio cobrado. Con otra causa, el local asume todo y el mecánico
        conserva su parte.

        idempotency_key evita repetir la devolución con un doble clic: si llega
        otra vez se devuelve la ya hecha. Devuelve (devolución, creada). Sin caja
        abierta lanza CashSessionClosed; sobre una venta anulada,
        SaleAlreadyVoided; por encima de lo vendido, ReturnExceedsSold; con un
        servicio ya devuelto, ServiceAlreadyReturned. Si algo falla no queda nada.
        """
        existing = self.filter(idempotency_key=idempotency_key).first()
        if existing:
            return existing, False
        if cause == ReturnCause.BAD_SERVICE and not user.is_owner:
            raise BadServiceOwnerOnly()
        if CashSession.objects.current() is None:
            raise CashSessionClosed()
        if sale.is_voided:
            raise SaleAlreadyVoided()
        if not items and not services:
            raise EmptyReturn()

        lines = [
            SaleReturnItem(
                sale_item=item["sale_item"], quantity=item["quantity"],
                condition=item.get("condition", ReturnCondition.RESELLABLE),
            )
            for item in items
        ]
        sold = [line.sale_item for line in lines]
        if len({item.pk for item in sold}) != len(sold):
            raise ValidationError({"items": "Un producto está repetido en la devolución: cambia su cantidad."})
        if any(item.sale_id != sale.pk for item in sold):
            raise ValidationError({"items": "Este producto no es de esta venta."})
        if len({service.pk for service in services}) != len(services):
            raise ValidationError({"services": "Un servicio está repetido en la devolución."})
        if any(service.sale_id != sale.pk for service in services):
            raise ValidationError({"services": "Este servicio no es de esta venta."})

        deduction = 0
        mechanic = None
        if cause == ReturnCause.BAD_SERVICE:
            mechanics = {service.mechanic_id for service in services}
            if len(mechanics) != 1:
                raise ValidationError({"services": "Indica los servicios de un solo mecánico."})
            mechanic = services[0].mechanic
            deduction = sum(service.labor_price for service in services) + sum(
                line.subtotal for line in lines if line.condition == ReturnCondition.DAMAGED
            )

        total = sum(line.subtotal for line in lines) + sum(service.labor_price for service in services)
        refunded = sum(refund["amount"] for refund in refunds)
        if refunded != total:
            raise RefundMismatch(total, refunded)

        try:
            with transaction.atomic():
                number = (self.aggregate(last=Max("number"))["last"] or 0) + 1
                sale_return = self.model(
                    number=number, sale=sale, cause=cause, reason=" ".join(reason.split()), total=total,
                    idempotency_key=idempotency_key, created_by=user,
                )
                sale_return.full_clean()
                sale_return.save()
                note = f"Devolución {number} venta {sale.number} · {sale_return.reason}"
                for line in lines:
                    line.sale_return = sale_return
                    line.full_clean(exclude=["sale_return"])
                    line.save()
                    # Cambio condicional: dos devoluciones al tiempo no superan lo vendido.
                    item = line.sale_item
                    updated = SaleItem.objects.filter(
                        pk=item.pk, returned_quantity__lte=F("quantity") - line.quantity,
                    ).update(returned_quantity=F("returned_quantity") + line.quantity)
                    if not updated:
                        item.refresh_from_db()
                        raise ReturnExceedsSold(item, item.quantity - item.returned_quantity, line.quantity)
                    if line.condition == ReturnCondition.RESELLABLE:
                        InventoryMovement.objects.record(
                            item.product, MovementKind.RETURN, line.quantity, user, unit_cost=item.unit_cost,
                            reason=note,
                        )
                for service in services:
                    if SaleReturnService.objects.filter(sale_service=service).exists():
                        raise ServiceAlreadyReturned(service)
                    SaleReturnService.objects.create(sale_return=sale_return, sale_service=service)
                for refund in refunds:
                    line = SaleReturnRefund(sale_return=sale_return, **refund)
                    line.full_clean(exclude=["sale_return"])
                    line.save()
                    CashMovement.objects.record(
                        CashMovementKind.SALE_REFUND, -line.amount, line.method, user, reason=note, sale=sale,
                        sale_return=sale_return,
                    )
                if deduction:
                    MechanicDeduction.objects.create(mechanic=mechanic, sale_return=sale_return, amount=deduction)
        except IntegrityError:
            # Dos peticiones con la misma clave al tiempo: la otra ganó, se devuelve la suya.
            existing = self.filter(idempotency_key=idempotency_key).first()
            if existing:
                return existing, False
            raise
        return sale_return, True


class SaleReturn(models.Model):
    """Devolución parcial o total de una venta.

    La venta original no cambia: esta devolución deja su propio documento y las
    operaciones contrarias. Nace completa con SaleReturn.objects.register() y no
    se edita ni se borra.
    """

    # Número visible, consecutivo y separado del de las ventas.
    number = models.PositiveIntegerField("número", unique=True)
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns", verbose_name="venta")
    cause = models.CharField("causa", max_length=15, choices=ReturnCause.choices)
    # Corto para que quepa en el motivo de los movimientos de caja e inventario, con su prefijo.
    reason = models.CharField("motivo", max_length=150)
    # Pesos enteros.
    total = models.PositiveBigIntegerField("total devuelto")
    idempotency_key = models.UUIDField("clave de reintento", unique=True, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sale_returns", verbose_name="registrada por",
    )
    created_at = models.DateTimeField("fecha", auto_now_add=True)

    objects = SaleReturnManager()

    class Meta:
        verbose_name = "devolución"
        verbose_name_plural = "devoluciones"
        ordering = ["-number"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(reason=""), name="sale_return_has_reason",
                violation_error_message="Indica el motivo de la devolución.",
            ),
        ]

    def __str__(self):
        return f"Devolución {self.number} · venta {self.sale.number}"

    def delete(self, *args, **kwargs):
        raise SaleIsFinal()


class SaleReturnItem(models.Model):
    """Unidades devueltas de un producto de la venta y en qué estado llegaron."""

    sale_return = models.ForeignKey(SaleReturn, on_delete=models.PROTECT, related_name="items", verbose_name="devolución")
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name="return_lines", verbose_name="producto de la venta")
    quantity = models.PositiveIntegerField("cantidad")
    condition = models.CharField("estado", max_length=10, choices=ReturnCondition.choices)

    class Meta:
        verbose_name = "producto devuelto"
        verbose_name_plural = "productos devueltos"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0), name="sale_return_item_quantity_positive",
                violation_error_message="La cantidad debe ser mayor que cero.",
            ),
            models.UniqueConstraint(
                "sale_return", "sale_item", name="sale_return_item_unique",
                violation_error_message="Este producto ya está en la devolución: cambia su cantidad.",
            ),
        ]

    def __str__(self):
        return f"{self.quantity} × {self.sale_item.description}"

    @property
    def subtotal(self):
        """Se reembolsa al precio cobrado en la venta, no al del catálogo de hoy."""
        return self.quantity * self.sale_item.unit_price


class SaleReturnService(models.Model):
    """Servicio devuelto. Es completo y único: la base no deja devolver dos veces el mismo."""

    sale_return = models.ForeignKey(SaleReturn, on_delete=models.PROTECT, related_name="services", verbose_name="devolución")
    sale_service = models.OneToOneField(
        SaleService, on_delete=models.PROTECT, related_name="return_line", verbose_name="servicio de la venta",
    )

    class Meta:
        verbose_name = "servicio devuelto"
        verbose_name_plural = "servicios devueltos"
        ordering = ["id"]

    def __str__(self):
        return str(self.sale_service)


class SaleReturnRefund(models.Model):
    """Parte del reembolso en un medio de pago."""

    sale_return = models.ForeignKey(SaleReturn, on_delete=models.PROTECT, related_name="refunds", verbose_name="devolución")
    method = models.CharField("medio de pago", max_length=10, choices=PaymentMethod.choices)
    # Pesos enteros.
    amount = models.PositiveBigIntegerField("valor")

    class Meta:
        verbose_name = "reembolso de la devolución"
        verbose_name_plural = "reembolsos de la devolución"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="sale_return_refund_amount_positive",
                violation_error_message="El valor debe ser mayor que cero.",
            ),
            models.UniqueConstraint(
                "sale_return", "method", name="sale_return_refund_method_unique",
                violation_error_message="Este medio ya está en el reembolso: suma los valores.",
            ),
        ]

    def __str__(self):
        return f"{self.get_method_display()} {self.amount} · devolución {self.sale_return_id}"
