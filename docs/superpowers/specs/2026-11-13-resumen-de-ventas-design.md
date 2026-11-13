# Diseño · Resumen de ventas por tipo, producto y servicio (Opción A)

**Fecha:** 2026-11-13
**Alcance:** Backend (`sales`), documentación de API y Frontend (`venta`).

## Objetivo

Permitir al dueño consultar, para cualquier rango de fechas, cuántas unidades se vendieron y cuánto dinero se recaudó agrupado por **tipo de producto**, **servicio** y **producto individual**, descontando ventas anuladas y devoluciones.

## Backend (`GET /sales/summary`)

- **Permisos:** `IsOwner` (solo dueño).
- **Parámetros query:** `date_from` y `date_to` (`AAAA-MM-DD`, ambos incluidos; si se omiten, usa el día actual en Colombia).
- **Cálculo neto:**
  - Excluye ventas anuladas (`voided_at__isnull=True`).
  - En `SaleItem`, usa cantidad neta `quantity - returned_quantity` (ignorando filas con neto 0) y recaudo `(quantity - returned_quantity) * unit_price`.
  - En `SaleService`, excluye servicios devueltos (`return_line__isnull=True`) y suma `labor_price`.
- **Respuesta:**
  - `date_from`, `date_to`
  - `totals`: `{ products_quantity, products_total, services_count, services_total, grand_total }`
  - `categories`: `[{ id, name, quantity, total }]` ordenado por `total` descendente.
  - `services`: `[{ id, name, count, total }]` ordenado por `total` descendente.
  - `products`: `[{ id, code, name, category_id, category_name, quantity, total }]` ordenado por `total` descendente.
- **Documentación:** actualizar `docs/backend/API.md` y `docs/backend/CAMBIOS.md` en el mismo commit.

## Frontend (`/venta/resumen`)

- **Ubicación:** submenú **Mostrador → Resumen** (`DESTINOS.resumenVentas`, solo rol `owner`).
- **Controles:** `FiltroDePeriodo` (Hoy, Esta semana / Últimos 7 días, Este mes, Fechas) + buscador de producto y filtro por tipo en la tabla de productos.
- **Indicadores:** Total recaudado, Productos (unidades y pesos) y Servicios (cantidad y pesos).
- **Tablas:**
  1. **Por tipo de producto** (al hacer clic en un tipo, filtra la tabla de productos).
  2. **Por servicio**.
  3. **Por producto** (código, nombre, tipo, unidades, total).
