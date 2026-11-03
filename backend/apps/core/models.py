from django.db import models


class BusinessSettings(models.Model):
    """Datos del negocio que se imprimen en el encabezado del recibo.

    Hay un solo registro (pk=1) por instalación.
    """

    SINGLETON_PK = 1

    name = models.CharField("nombre del negocio", max_length=120, blank=True)
    tax_id = models.CharField("NIT o cédula", max_length=30, blank=True)
    address = models.CharField("dirección", max_length=200, blank=True)
    phone = models.CharField("teléfono", max_length=40, blank=True)
    receipt_footer = models.TextField("texto al pie del recibo", blank=True)
    updated_at = models.DateTimeField("actualizado", auto_now=True)

    class Meta:
        verbose_name = "datos del negocio"
        verbose_name_plural = "datos del negocio"
        constraints = [
            models.CheckConstraint(condition=models.Q(pk=1), name="business_settings_singleton"),
        ]

    def __str__(self):
        return self.name or "Negocio sin nombre"

    @classmethod
    def load(cls):
        settings, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return settings


class PaymentMethod(models.TextChoices):
    """Medio con que se paga a un proveedor o se le cobra a un cliente."""

    CASH = "cash", "Efectivo"
    TRANSFER = "transfer", "Transferencia"


class PaymentStatus(models.TextChoices):
    """Cómo va el pago de una compra o una venta. No hay plazo: se abona cuando se puede."""

    PENDING = "pending", "Sin abonos"
    PARTIAL = "partial", "Con abonos"
    PAID = "paid", "Pagada"
