"""Cálculo del recuento mensual consolidado del negocio."""
import calendar
from collections import defaultdict
from datetime import date
import re

from django.db.models import Count, F, Q, Sum
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.cash.models import CashMovement, CashMovementKind, CashSession, INCOMING_KINDS, OUTGOING_KINDS
from apps.catalog.models import Product
from apps.consignments.models import ConsigneePayment, ConsignmentDelivery, ConsignmentReport
from apps.core.models import BusinessSettings, PaymentMethod
from apps.purchases.models import Purchase, PurchaseStatus, SupplierPayment
from apps.sales.models import Sale, SaleItem, SalePayment, SaleReturn, SaleReturnRefund, SaleService
from apps.workshop.models import MechanicSettlement

MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


def parse_month_range(month_str: str | None) -> tuple[str, date, date]:
    """Convierte `AAAA-MM` (o el mes actual en Colombia) en `(month_str, date_from, date_to)`."""
    if not month_str:
        today = timezone.localdate()
        year, month = today.year, today.month
    else:
        match = MONTH_RE.match(month_str.strip())
        if not match:
            raise ValidationError({"month": "Indica el mes en formato AAAA-MM."})
        year, month = int(match.group(1)), int(match.group(2))
        if month < 1 or month > 12:
            raise ValidationError({"month": "El mes debe estar entre 01 y 12."})
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}", date(year, month, 1), date(year, month, last_day)


def _sales_breakdown(date_from: date, date_to: date) -> tuple[dict, list, list, list]:
    product_rows = (
        SaleItem.objects.filter(
            sale__voided_at__isnull=True,
            sale__created_at__date__range=(date_from, date_to),
            quantity__gt=F("returned_quantity"),
        )
        .annotate(
            net_quantity=F("quantity") - F("returned_quantity"),
            net_total=(F("quantity") - F("returned_quantity")) * F("unit_price"),
        )
        .values("product_id", "product__code", "product__name", "product__category_id", "product__category__name")
        .annotate(quantity=Sum("net_quantity"), total=Sum("net_total"))
        .order_by("-total", "product__name")
    )

    products = []
    categories_map: dict[int, dict] = {}
    products_quantity = 0
    products_total = 0
    for row in product_rows:
        qty = row["quantity"] or 0
        total = row["total"] or 0
        cat_id = row["product__category_id"]
        cat_name = row["product__category__name"]
        products.append(
            {
                "id": row["product_id"],
                "code": row["product__code"],
                "name": row["product__name"],
                "category_name": cat_name,
                "quantity": qty,
                "total": total,
            }
        )
        if cat_id not in categories_map:
            categories_map[cat_id] = {"id": cat_id, "name": cat_name, "quantity": 0, "total": 0}
        categories_map[cat_id]["quantity"] += qty
        categories_map[cat_id]["total"] += total
        products_quantity += qty
        products_total += total

    categories = sorted(categories_map.values(), key=lambda c: (-c["total"], c["name"]))

    service_rows = (
        SaleService.objects.filter(
            sale__voided_at__isnull=True,
            sale__created_at__date__range=(date_from, date_to),
            return_line__isnull=True,
        )
        .values("service_type_id", "service_type__name")
        .annotate(count=Count("id"), total=Sum("labor_price"))
        .order_by("-total", "service_type__name")
    )
    services = []
    services_count = 0
    services_total = 0
    for row in service_rows:
        cnt = row["count"] or 0
        total = row["total"] or 0
        services.append({"id": row["service_type_id"], "name": row["service_type__name"], "count": cnt, "total": total})
        services_count += cnt
        services_total += total

    valid_sales = Sale.objects.filter(voided_at__isnull=True, created_at__date__range=(date_from, date_to))
    voided_count = Sale.objects.filter(voided_at__isnull=False, created_at__date__range=(date_from, date_to)).count()
    returns_qs = SaleReturn.objects.filter(created_at__date__range=(date_from, date_to))
    gross_agg = valid_sales.aggregate(count=Count("id"), total=Sum("total"))
    returns_agg = returns_qs.aggregate(count=Count("id"), total=Sum("total"))
    gross_total = gross_agg["total"] or 0
    returns_total = returns_agg["total"] or 0

    paid_by_method = dict(
        SalePayment.objects.filter(
            sale__voided_at__isnull=True,
            sale__created_at__date__range=(date_from, date_to),
        )
        .values("method")
        .annotate(total=Sum("amount"))
        .values_list("method", "total")
    )
    refund_by_method = dict(
        SaleReturnRefund.objects.filter(sale_return__created_at__date__range=(date_from, date_to))
        .values("method")
        .annotate(total=Sum("amount"))
        .values_list("method", "total")
    )

    sales_summary = {
        "count": gross_agg["count"] or 0,
        "voided_count": voided_count,
        "products_quantity": products_quantity,
        "products_total": products_total,
        "services_count": services_count,
        "services_total": services_total,
        "gross_total": gross_total,
        "returns_count": returns_agg["count"] or 0,
        "returns_total": returns_total,
        "net_total": gross_total - returns_total,
        "cash_total": (paid_by_method.get(PaymentMethod.CASH) or 0) - (refund_by_method.get(PaymentMethod.CASH) or 0),
        "transfer_total": (
            (paid_by_method.get(PaymentMethod.TRANSFER) or 0) - (refund_by_method.get(PaymentMethod.TRANSFER) or 0)
        ),
    }
    return sales_summary, categories, services, products


def _daily_breakdown(date_from: date, date_to: date) -> list[dict]:
    by_day: dict[str, dict] = defaultdict(
        lambda: {"date": "", "sales_count": 0, "gross_total": 0, "returns_total": 0, "net_total": 0}
    )
    sales_daily = (
        Sale.objects.filter(voided_at__isnull=True, created_at__date__range=(date_from, date_to))
        .annotate(day=TruncDate("created_at", tzinfo=timezone.get_current_timezone()))
        .values("day")
        .annotate(count=Count("id"), total=Sum("total"))
    )
    for row in sales_daily:
        iso = row["day"].isoformat()
        entry = by_day[iso]
        entry["date"] = iso
        entry["sales_count"] = row["count"] or 0
        entry["gross_total"] = row["total"] or 0

    returns_daily = (
        SaleReturn.objects.filter(created_at__date__range=(date_from, date_to))
        .annotate(day=TruncDate("created_at", tzinfo=timezone.get_current_timezone()))
        .values("day")
        .annotate(total=Sum("total"))
    )
    for row in returns_daily:
        iso = row["day"].isoformat()
        entry = by_day[iso]
        entry["date"] = iso
        entry["returns_total"] = row["total"] or 0

    rows = []
    for iso in sorted(by_day):
        entry = by_day[iso]
        entry["net_total"] = entry["gross_total"] - entry["returns_total"]
        rows.append(entry)
    return rows


def low_stock_products() -> list[dict]:
    products = (
        Product.objects.filter(is_active=True)
        .annotate(current_stock=Coalesce(F("balance__quantity"), 0))
        .filter(current_stock__lte=F("min_stock"))
        .values("id", "code", "name", "current_stock", "min_stock")
    )
    rows = [
        {
            "id": p["id"],
            "code": p["code"],
            "name": p["name"],
            "stock": p["current_stock"],
            "min_stock": p["min_stock"],
        }
        for p in products
    ]
    rows.sort(key=lambda p: (p["stock"] / max(p["min_stock"], 1), p["name"].lower()))
    return rows


def build_monthly_report(month_str: str | None) -> dict:
    """Arma el recuento mensual consolidado del negocio para `AAAA-MM`."""
    month_label, date_from, date_to = parse_month_range(month_str)
    settings_obj = BusinessSettings.load()
    sales_summary, categories, services, products = _sales_breakdown(date_from, date_to)

    movements = CashMovement.objects.filter(created_at__date__range=(date_from, date_to))
    cash_totals = movements.aggregate(
        expenses=Sum("amount", filter=Q(kind=CashMovementKind.EXPENSE)),
        withdrawals=Sum("amount", filter=Q(kind=CashMovementKind.OWNER_WITHDRAWAL)),
        incoming=Sum("amount", filter=Q(kind__in=INCOMING_KINDS)),
        outgoing=Sum("amount", filter=Q(kind__in=OUTGOING_KINDS)),
    )
    cash_summary = {
        "sessions_count": CashSession.objects.filter(opened_at__date__range=(date_from, date_to)).count(),
        "expenses_total": abs(cash_totals["expenses"] or 0),
        "owner_withdrawals_total": abs(cash_totals["withdrawals"] or 0),
        "incoming_total": cash_totals["incoming"] or 0,
        "outgoing_total": abs(cash_totals["outgoing"] or 0),
    }

    purchases_agg = Purchase.objects.filter(
        status=PurchaseStatus.RECEIVED, received_at__date__range=(date_from, date_to),
    ).aggregate(count=Count("id"), total=Sum("total"))
    supplier_payments = SupplierPayment.objects.filter(paid_on__range=(date_from, date_to)).aggregate(
        total=Sum("amount"),
    )
    purchases_summary = {
        "received_count": purchases_agg["count"] or 0,
        "received_total": purchases_agg["total"] or 0,
        "payments_total": supplier_payments["total"] or 0,
    }

    settlements_agg = MechanicSettlement.objects.filter(date__range=(date_from, date_to)).aggregate(
        count=Count("id"),
        labor=Sum("labor_total"),
        paid=Sum("amount"),
        deductions=Sum("deductions_total"),
    )
    labor_total = settlements_agg["labor"] or 0
    mechanic_paid = settlements_agg["paid"] or 0
    deductions_total = settlements_agg["deductions"] or 0
    workshop_summary = {
        "settlements_count": settlements_agg["count"] or 0,
        "labor_total": labor_total,
        "mechanic_paid_total": mechanic_paid,
        "deductions_total": deductions_total,
        "shop_share_total": max(0, labor_total - mechanic_paid - deductions_total),
    }

    consignments_summary = {
        "deliveries_count": ConsignmentDelivery.objects.filter(
            created_at__date__range=(date_from, date_to),
        ).count(),
        "reports_total": ConsignmentReport.objects.filter(
            created_at__date__range=(date_from, date_to),
        ).aggregate(total=Sum("total"))["total"] or 0,
        "payments_total": ConsigneePayment.objects.filter(
            created_at__date__range=(date_from, date_to),
        ).aggregate(total=Sum("amount"))["total"] or 0,
    }

    return {
        "month": month_label,
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "business": {
            "name": settings_obj.name,
            "tax_id": settings_obj.tax_id,
            "address": settings_obj.address,
            "phone": settings_obj.phone,
        },
        "sales": sales_summary,
        "cash": cash_summary,
        "purchases": purchases_summary,
        "workshop": workshop_summary,
        "consignments": consignments_summary,
        "categories": categories,
        "services": services,
        "products": products,
        "daily": _daily_breakdown(date_from, date_to),
        "low_stock": low_stock_products(),
    }
