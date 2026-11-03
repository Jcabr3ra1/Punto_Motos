# Bitácora de cambios del backend

Resumen de cada cambio del backend y de lo que implica para el frontend. La entrada más reciente va arriba. El contrato completo está en [API.md](API.md).

Formato de cada entrada:

```text
## AAAA-MM-DD · Título corto (versión)
Qué cambió: ...
Qué debe hacer el frontend: ... (o "Ninguna acción para el frontend")
Cambio incompatible: solo si se renombra o quita algo que el frontend ya usa
```

## 2026-11-03 · Ventas, caja y consignación (0.6.0)

**Qué cambió**

- **Clientes:** `/customers`, para cualquier usuario con sesión. El nombre es obligatorio y puede repetirse; el teléfono es opcional. Búsqueda con `?q=` por todas las palabras del nombre (sin tildes) o por teléfono. No se borran: se desactivan.
- **Ventas:** `POST /sales` confirma una venta de mostrador **pagada completa**. **No hay ventas a crédito:** los pagos, uno por medio (efectivo o transferencia), deben sumar exactamente el total.
  - Lleva un `idempotency_key` (UUID) que genera la ventana. Si llega repetido, responde **200** con la venta ya hecha, sin descontar otra vez. Una venta nueva responde 201.
  - El cliente va como `customer` (existente) o `new_customer` (se crea con la venta).
  - El precio es el del catálogo. Solo el dueño puede cambiarlo en la venta; la línea queda con `price_changed`.
  - Cada línea guarda descripción, precio de catálogo, precio cobrado y costo del momento: cambiar el catálogo después no altera la venta. El costo solo se le envía al dueño.
  - Número consecutivo de recibo en `number`. Lista paginada con filtros y detalle para reimprimir.
  - No se vende mientras el inventario inicial está abierto ni sin caja abierta.
- **Anulación:** `POST /sales/{id}/void` con motivo, solo el dueño. La venta queda marcada (`is_voided`, `voided_at`, `voided_by`, `void_reason`), las unidades vuelven al inventario y los pagos se reembolsan por el mismo medio desde la caja abierta.
- **Caja:** `/cash-sessions` y `/cash-movements`, solo el dueño, salvo `GET /cash-sessions/current`, que cualquiera puede consultar para saber si se puede vender.
  - Se abre con el efectivo del cajón y se cierra con el contado. Si no cuadra, la explicación es obligatoria y la diferencia queda guardada.
  - Las ventas, anulaciones, abonos a proveedores de hoy y pagos de locales entran o salen de la caja solos. Gastos y retiros del dueño se registran a mano con su motivo.
  - Resumen por tipo de movimiento, separado en efectivo y transferencia.
- **Consignación:** `/consignees`, `/consignment-deliveries`, `/consignment-reports` y `/consignee-payments`, solo el dueño.
  - La entrega saca las unidades del inventario, con un valor pactado por unidad (por defecto el costo, no el precio de venta).
  - El reporte del local suma lo vendido a su saldo y devuelve al inventario lo que no vendió.
  - El local paga por partes; cada pago entra a la caja.
  - `GET /consignees/{id}/pending-items` dice lo que cada local todavía tiene.
- **Inventario:** dos tipos de movimiento nuevos, `consignment_out` (resta) y `consignment_return` (suma).
- **Catálogo:** la sigla de tipos y motos ahora acepta **de 2 a 8 letras** (antes de 2 a 4).
- Errores nuevos: 409 `initial_count_open`, 409 `cash_session_closed` y 409 `sale_voided`. Los errores de una línea llegan anidados (`items.1.quantity`, `lines.0.sold`).

**Cambio incompatible**

- **Un abono a proveedor con fecha de hoy ahora necesita caja abierta**, porque sale de ella. Sin caja, `POST /supplier-payments` y `POST /purchases/{id}/receive` con abono responden 409 `cash_session_closed`. Un abono con fecha anterior sigue funcionando igual y no toca la caja.

**Qué debe hacer el frontend**

- Pantalla de **venta**: carrito en la ventana, buscador de clientes (`/customers?q=...&page_size=8`) con opción de crear uno nuevo, pagos por medio con el vuelto calculado en la ventana y botón **Cobrar** que genere un `idempotency_key` nuevo por venta y lo reutilice en los reintentos. Deshabilitar el botón mientras responde.
- Antes de vender, consultar `GET /cash-sessions/current`: si `is_open` es `false`, avisar que la caja está cerrada (el vendedor debe pedirle al dueño que la abra).
- Mostrar el campo de precio editable solo al dueño.
- Lista de **ventas** con filtros y detalle para reimprimir; botón **Anular** solo para el dueño, con motivo obligatorio. Mostrar las anuladas marcadas.
- Pantalla de **caja** (solo el dueño): abrir con el efectivo sugerido (`suggested_opening_cash`), ver el esperado y el resumen, registrar gastos y retiros, y cerrar con el contado y la explicación si no cuadra.
- Pantalla de **consignación** (solo el dueño): locales con su saldo, entregas con el valor pactado precargado con el costo, reporte armado desde `pending-items` y pagos.
- En **compras**: manejar el 409 `cash_session_closed` al abonar o recibir con abono.
- En el **kárdex**: agregar `consignment_out` y `consignment_return` al tipo `MovementKind` (`frontend/src/api/types.ts`).
- En **tipos y motos**: subir el límite de la sigla a 8 letras (`maxLength={4}` en `FormularioDeCatalogo.tsx`) y los textos de ayuda «De 2 a 4 letras» en `Catalogo.tsx`.
- Usar los tipos de [API.md](API.md#clientes-y-ventas): `Customer`, `Sale`, `SaleDetail`, `SaleInput`, `CashSession`, `CurrentCash`, `CashMovement`, `SpendInput`, `Consignee`, `ConsignmentDelivery`, `ConsignmentReport`, `ConsigneePayment` y sus `Input`.

## 2026-11-01 · Compras y proveedores (0.5.0)

**Qué cambió**

- Todo el módulo es **solo del dueño**; el vendedor recibe 403.
- Proveedores: `/suppliers`, con `balance_due` (lo que se le debe en total) y filtros `?q=`, `?with_debt=true` e `?include_inactive=true`. No se borran: se desactivan.
- Compras: `/purchases`.
  - **Borrador:** se crea, se edita con `PATCH` y se puede borrar. No toca el inventario. Las líneas enviadas en `items` reemplazan todas las anteriores.
  - **Recibir:** `POST /purchases/{id}/receive` registra la recepción completa, con un abono opcional entregado con la mercancía. Desde ahí la compra no se edita ni se borra.
  - Lista paginada con filtros por proveedor, estado, estado de pago y fechas.
- Pagos **por abonos, sin plazo**. Cada compra recibida tiene `payment_status`: `pending` (sin abonos), `partial` (con abonos) o `paid` (pagada), además de `balance_due`.
- Abonos: `POST /supplier-payments`. Pueden ir a una compra (`purchase`) o al proveedor en general, y en ese caso pagan primero las compras más antiguas. Llevan fecha de pago (`paid_on`, por defecto hoy). No se editan ni se borran.
- Al recibir una compra, el costo de cada producto pasa al **promedio ponderado**. **Si el costo sube, el precio de venta sube los mismos pesos, redondeado hacia arriba a miles**, y el cambio queda en un historial de precios. Si el costo baja, el precio no cambia.
- Los movimientos de inventario de una compra llevan `reason`: "Compra 15 · Distribuidora Andina".
- Error nuevo: 409 `purchase_received`.

**Qué debe hacer el frontend**

- Pantalla **Proveedores** (solo el dueño): lista con lo que se les debe, alta, edición y desactivación. Sin botón de eliminar.
- Pantalla **Compras** (solo el dueño): lista con filtros y formulario del borrador, con el buscador de productos y el costo por unidad precargado con `cost_price`.
- Botón **Recibir compra**, con confirmación y un campo opcional de abono (valor y medio de pago). Deshabilitarlo mientras responde. Si la respuesta trae `price_changes`, mostrar qué precios subieron.
- Formulario **Abonar** desde el proveedor o desde una compra, con valor, medio de pago, fecha (hoy por defecto) y notas.
- **Estado de cuenta del proveedor:** `balance_due`, compras con saldo (`?supplier={id}&payment_status=pending,partial`) y abonos (`/supplier-payments?supplier={id}`).
- Volver a consultar los productos después de recibir una compra: pueden cambiar `cost_price` y `sale_price`.
- Usar los tipos `Supplier`, `Purchase`, `PurchaseDetail`, `PurchaseInput`, `ReceivedPurchase`, `SupplierPayment` y `SupplierPaymentInput` de [API.md](API.md#compras-y-proveedores).

Ninguna acción por cambios incompatibles: solo se agregan rutas y campos.

## 2026-10-31 · Inventario (0.4.0)

**Qué cambió**

- Existencias por producto, que solo cambian con movimientos: inventario inicial, compra, venta, devolución y ajuste. Nunca quedan en negativo.
- `Product` trae dos campos nuevos: `stock` (unidades disponibles) e `is_low_stock` (`stock <= min_stock`). Llegan en `/products`, `/products/{id}` y `/catalog/search`, para el dueño y el vendedor.
- `GET /inventory/movements`: kárdex paginado con filtros por producto, tipo y fechas. El vendedor no recibe `unit_cost`.
- `POST /inventory/adjustments` (solo el dueño): suma o resta unidades, siempre con motivo.
- Inventario inicial: `GET /inventory/initial-count` (estado y avance), `POST /inventory/initial-count/items` (producto nuevo con su cantidad contada, en una sola operación) y `POST /inventory/initial-count/finish` (lo termina una sola vez).
- Error nuevo: 409 `initial_count_finished`.

**Qué debe hacer el frontend**

- Agregar `stock` e `is_low_stock` al tipo `Product`. Mostrar la existencia en la lista de productos y marcar los que hay que reponer.
- En el buscador de venta, mostrar **deshabilitados** los productos con `stock: 0`.
- Pantalla **Inventario inicial** (solo el dueño): formulario de producto con el campo **Cantidad contada**, avance (`products_counted`, `units_counted`) y botón **Terminar conteo** con confirmación. Ocultarla cuando `is_open` sea `false`.
- Mientras `is_open` sea `true`, avisar en la pantalla de venta que el conteo no ha terminado.
- Pantalla **Movimientos de inventario** con filtros por producto, tipo y fechas, y acceso al kárdex desde cada producto (`?product=<id>`).
- Formulario **Ajustar existencia** (solo el dueño) con cantidad positiva o negativa y motivo obligatorio.
- Usar los tipos `InventoryMovement`, `AdjustmentInput`, `InitialCountStatus` e `InitialCountItemInput` de [API.md](API.md#inventario).

Ninguna acción por cambios incompatibles: solo se agregan campos y rutas.

## 2026-10-31 · Catálogo de productos (0.3.0)

**Qué cambió**

- Tipos, marcas y motos: `/catalog/categories`, `/catalog/brands` y `/catalog/motos`. Todos consultan; solo el dueño crea y edita; no se borran, se desactivan.
- Productos: `/products` paginado con filtros por texto, tipo, moto (incluidas las compatibles), insumos de taller y orden.
- Código interno de producto: se puede escribir o dejar vacío para que se genere (`FRE-PUL-PAS`, `ELE-UNI-BUJ`, `LL909018`). Los guiones no cuentan para saber si está repetido.
- `GET /catalog/code-suggestion` (solo el dueño) para sugerir el código mientras se llena el formulario.
- `GET /catalog/search`: buscador de la pantalla de venta. Hasta 8 resultados: código exacto, luego códigos que empiezan igual, luego palabras en nombre, marca y motos, **sin tildes ni mayúsculas**.
- Dinero en **pesos enteros** (`25000` = $25.000).
- El vendedor **no recibe** `cost_price` ni `sells_below_cost`.
- Los listados largos responden paginados: `{ count, next, previous, results }`.

**Qué debe hacer el frontend**

- Pantallas de **Configuración → Tipos, Marcas y Motos** (solo el dueño), con `?include_inactive=true` para ver los desactivados.
- Pantalla **Productos** con la lista paginada y los filtros, y el formulario de alta y edición. El formulario envía ids, pide la sugerencia de código con una pausa corta mientras el dueño escribe y muestra una advertencia cuando `sells_below_cost` es `true`.
- Buscador de la pantalla de venta con `GET /catalog/search` desde 2 caracteres.
- Tratar `cost_price` como opcional en los tipos: no llega para el vendedor.
- Usar los tipos `Category`, `Brand`, `MotoModel`, `Product`, `ProductInput` y `Paginated<T>` de [API.md](API.md#productos).

Ninguna acción por cambios incompatibles: lo existente no cambia.

## 2026-10-30 · Usuarios, sesión y permisos (0.2.0)

**Cambio incompatible:** `GET`, `PUT` y `PATCH /settings/business` ahora exigen sesión (`Authorization: Token ...`) y solo el dueño puede modificar. Sin sesión responden 401 `not_authenticated`; un vendedor que intente modificar recibe 403 `permission_denied`.

**Qué cambió**

- Usuarios con dos roles: dueño (`owner`) y vendedor (`seller`). No se borran: se desactivan.
- Configuración inicial: `GET /setup/status` y `POST /setup/owner`, que crea el primer dueño una sola vez.
- Sesión: `POST /auth/login`, `POST /auth/logout` y `GET /auth/me`. Un token por usuario; cada inicio reemplaza el anterior y todas las sesiones se borran al abrir el programa. Máximo 10 intentos de inicio por minuto.
- Administración de usuarios (solo el dueño): `GET` y `POST /users`, `GET` y `PATCH /users/{id}`, `POST /users/{id}/set-password`. Desactivar un usuario o cambiarle la contraseña cierra su sesión. Debe quedar siempre al menos un dueño activo.
- Errores nuevos: 401 `not_authenticated` y `authentication_failed`, 403 `permission_denied` y 429 `throttled`.

**Qué debe hacer el frontend**

- Agregar la cabecera `Authorization: Token <token>` al cliente HTTP y guardar el token solo en memoria. Ver el [ejemplo de cliente](API.md#ejemplo-de-cliente).
- Al iniciar el programa seguir el [flujo de inicio](API.md#flujo-de-inicio-del-programa): `GET /setup/status` y, según la respuesta, el asistente para crear el dueño o la pantalla de inicio de sesión.
- Ante 401 `not_authenticated` o `authentication_failed`, borrar el token y volver a la pantalla de inicio de sesión.
- Mostrar u ocultar acciones según `user.role`. La pantalla **Configuración → Datos del negocio** es de solo lectura para el vendedor.
- Nueva pantalla **Configuración → Usuarios** (solo el dueño): lista, crear, editar rol y estado, y asignar contraseña. Sin botón de eliminar.

## 2026-10-30 · Base del backend (0.1.0)

**Qué cambió**

- Proyecto Django 5.2 con Django REST Framework y SQLite en la carpeta de datos que entrega Tauri.
- Sidecar `backend/run.py`: aplica migraciones y sirve la API con Waitress solo en `127.0.0.1`. No arranca sin credencial ni crea una base vacía si falta la carpeta de datos.
- Protección de la API: cabecera `X-Punto-Moto-Token` obligatoria y lista de orígenes permitidos (ventana de Tauri y Vite en `http://localhost:5173`).
- Formato único de errores `{ code, message, fields }`, también para rutas inexistentes (404) y fallos inesperados (500).
- Endpoints nuevos:
  - `GET /api/v1/health`
  - `GET`, `PUT` y `PATCH /api/v1/settings/business` (datos del negocio para el recibo).

**Qué debe hacer el frontend**

- Crear el cliente HTTP con la URL base, la cabecera de la credencial y el manejo de `ApiError` descritos en [API.md](API.md#conexión).
- Mostrar los errores de `fields` junto a cada campo del formulario.
- Se puede construir ya la pantalla de **Configuración → Datos del negocio** con `GET` y `PUT /settings/business`.
- Para desarrollar sin Tauri, levantar el backend con `PUNTO_MOTO_DEBUG=1 ... manage.py runserver 127.0.0.1:8765`; no pide credencial.

**Pendiente de acordar con desktop:** cómo recibe la ventana el puerto y la credencial que genera Tauri.
