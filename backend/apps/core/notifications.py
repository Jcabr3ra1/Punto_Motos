"""Resumen de alertas y existencias bajas para la barra de notificaciones."""
from django.utils import timezone

from apps.accounts.models import Role
from apps.cash.models import CashSession
from apps.purchases.models import Purchase, PurchaseStatus
from apps.workshop.models import Mechanic

from .models import BusinessSettings
from .monthly_report import low_stock_products

BACKUP_MAX_AGE_DAYS = 7
MAX_LOW_STOCK_ITEMS = 5


def _plural(count: int, singular: str, plural_text: str) -> str:
    return f"{count} {singular if count == 1 else plural_text}"


def _owner_alerts() -> list[dict]:
    alerts: list[dict] = []
    now = timezone.now()
    today = timezone.localdate(now)

    open_cash = CashSession.objects.filter(closed_at__isnull=True).order_by("-opened_at").first()
    if open_cash is not None and timezone.localdate(open_cash.opened_at) < today:
        alerts.append(
            {
                "key": "cash_previous_day",
                "title": "Caja de día anterior abierta",
                "detail": "Ciérrala antes de continuar vendiendo hoy.",
                "route": "/caja",
                "level": "urgent",
            }
        )

    last_backup_at = BusinessSettings.load().last_backup_at
    if last_backup_at is None:
        alerts.append(
            {
                "key": "missing_backup",
                "title": "Sin copia de seguridad externa",
                "detail": "Descarga una copia de tus datos para guardarla fuera del equipo.",
                "route": "/configuracion/respaldos",
                "level": "warning",
            }
        )
    else:
        days = (now - last_backup_at).days
        if days >= BACKUP_MAX_AGE_DAYS:
            alerts.append(
                {
                    "key": "stale_backup",
                    "title": f"Copia de seguridad de hace {_plural(days, 'día', 'días')}",
                    "detail": "Conviene descargar una copia reciente.",
                    "route": "/configuracion/respaldos",
                    "level": "warning",
                }
            )

    pending_mechanics = (
        Mechanic.objects.filter(
            services__settlement__isnull=True,
            services__sale__voided_at__isnull=True,
            services__sale__created_at__date=today,
        )
        .distinct()
        .count()
    )
    if pending_mechanics > 0:
        alerts.append(
            {
                "key": "pending_settlements",
                "title": _plural(pending_mechanics, "mecánico por liquidar hoy", "mecánicos por liquidar hoy"),
                "detail": "Revisa los servicios realizados en Liquidación del día.",
                "route": "/taller/liquidacion",
                "level": "warning",
            }
        )

    draft_purchases = Purchase.objects.filter(status=PurchaseStatus.DRAFT).count()
    if draft_purchases > 0:
        alerts.append(
            {
                "key": "draft_purchases",
                "title": _plural(draft_purchases, "compra en borrador", "compras en borrador"),
                "detail": "Aún no entran al inventario.",
                "route": "/compras?status=draft&periodo=todas",
                "level": "warning",
            }
        )

    return alerts


def build_notifications(user) -> dict:
    """Devuelve existencias por reponer (para todo el equipo) y alertas operativas (solo dueño)."""
    low_stock_all = low_stock_products()
    return {
        "low_stock_count": len(low_stock_all),
        "low_stock": low_stock_all[:MAX_LOW_STOCK_ITEMS],
        "alerts": _owner_alerts() if getattr(user, "role", None) == Role.OWNER else [],
    }
