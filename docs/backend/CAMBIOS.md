# Bitácora de cambios del backend

Resumen de cada cambio del backend y de lo que implica para el frontend. La entrada más reciente va arriba. El contrato completo está en [API.md](API.md).

Formato de cada entrada:

```text
## AAAA-MM-DD · Título corto (versión)
Qué cambió: ...
Qué debe hacer el frontend: ... (o "Ninguna acción para el frontend")
Cambio incompatible: solo si se renombra o quita algo que el frontend ya usa
```

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
