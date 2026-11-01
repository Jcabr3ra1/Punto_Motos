from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class Role(models.TextChoices):
    OWNER = "owner", "Dueño"
    SELLER = "seller", "Vendedor"


class PuntoMotoUserManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # El superusuario de Django siempre es el dueño del negocio.
        extra_fields.setdefault("role", Role.OWNER)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """Persona que inicia sesión en el programa.

    El dueño tiene acceso administrativo: cambia precios, ve costos, ajusta
    existencias, anula documentos y restaura respaldos. El vendedor registra
    ventas y cobros. Los mecánicos son empleados y solo tendrán usuario si
    necesitan operar el programa.

    Un usuario con operaciones asociadas no se elimina: se desactiva con
    is_active = False.
    """

    role = models.CharField("rol", max_length=20, choices=Role.choices, default=Role.SELLER)

    objects = PuntoMotoUserManager()

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"
        ordering = ["username"]

    @property
    def is_owner(self):
        return self.role == Role.OWNER

    @property
    def display_name(self):
        return self.get_full_name() or self.username
