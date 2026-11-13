# Bitácora de cambios del backend

Resumen de cada cambio del backend y de lo que implica para el frontend. La entrada más reciente va arriba. El contrato completo está en [API.md](API.md).

Formato de cada entrada:

```text
## AAAA-MM-DD · Título corto (versión)
Qué cambió: ...
Qué debe hacer el frontend: ... (o "Ninguna acción para el frontend")
Cambio incompatible: solo si se renombra o quita algo que el frontend ya usa
```

## 2026-11-13 · Copias de seguridad descargables y recuento mensual consolidado

**Qué cambió**

- **`BusinessSettings.last_backup_at`**: nuevo campo opcional de solo lectura en `GET/PUT/PATCH /settings/business` (migración `core.0003_businesssettings_last_backup_at`). Registra cuándo descargó el dueño su última copia externa.
- **`GET /backups/download`** (solo el dueño): genera una copia SQLite consistente con `sqlite3.backup()`, comprueba `PRAGMA integrity_check`, actualiza `last_backup_at` y responde con `Content-Type: application/x-sqlite3`, `Content-Disposition` y `X-Backup-Sha256`.
- **`GET /reports/monthly?month=AAAA-MM`** (solo el dueño): consolida ventas netas, caja, compras, liquidaciones de taller, consignaciones, desglose por día/tipo/servicio/producto y productos por reponer del mes pedido (`400 validation_error` con `fields.month` si el formato no es `AAAA-MM`).
- **`GET /notifications`** (sesión): devuelve `low_stock_count`, hasta 5 productos urgentes en `low_stock` y, solo para el dueño, alertas operativas (`alerts`) sobre respaldo, caja de día anterior, liquidaciones pendientes y borradores de compra.
- **CORS**: expone `Content-Disposition` y `X-Backup-Sha256` al frontend en respuestas no preflight.

**Qué debe hacer el frontend**

- Mostrar el estado de `last_backup_at`, ofrecer la descarga en **Configuración → Copias de seguridad** y avisar en notificaciones cuando falte o supere 7 días.
- Consumir `GET /reports/monthly` en **Mostrador → Resumen** para generar el libro mensual `.xlsx`.

## 2026-11-13 · Eliminar mecánicos sin historial y detallar servicios en liquidación diaria

**Qué cambió**

- **`DELETE /mechanics/{id}`** (solo el dueño): elimina un mecánico sin servicios, liquidaciones ni descuentos (responde 204). Si tiene historial, responde 409 `mechanic_has_history`.
- **`GET /mechanic-settlements/daily`**: cada fila de `mechanics` incluye ahora `services` (`SettledService[]`) con los servicios pendientes del mecánico para ese día.

**Qué debe hacer el frontend**

Ya está hecho en este mismo cambio: botón **Eliminar** en **Configuración / Taller → Mecánicos** y detalle de servicios + ventana interactiva en **Liquidación del día**.

## 2026-11-13 · Resumen neto de ventas por tipo, servicio y producto

**Qué cambió**

- **`GET /sales/summary`** (solo el dueño): devuelve los totales netos y el desglose por tipo de producto (`categories`), tipo de servicio (`services`) y producto individual (`products`) en el rango `?date_from=` y `?date_to=` (por defecto, hoy en Colombia). Excluye ventas anuladas y descuenta devoluciones.

**Qué debe hacer el frontend**

Ya está hecho en este mismo cambio: pantalla **Mostrador → Resumen** (`/venta/resumen`) para el dueño.

## 2026-11-06 · Venta sin cliente y sin placa (0.11.0)

**Qué cambió**

- **El cliente es opcional en `POST /sales`:** se puede enviar `customer`, `new_customer` o ninguno. Enviar los dos sigue siendo un error. El teléfono solo no se guarda: un cliente nuevo necesita nombre (`fields.new_customer.name`).
- **Se eliminó la placa:** `plate` sale de las ventas, liquidaciones, descuentos y devoluciones, y de la base de datos con la migración `sales` 0005. **Las placas ya registradas se pierden al aplicarla**, salvo en el respaldo automático previo a las migraciones.
- El motivo de los movimientos de caja e inventario de una venta sin cliente queda como `Venta 41`, sin el nombre.

**Cambio incompatible**

- `customer` puede llegar en `null` en `Sale`, `SaleDetail`, `SaleReturn` y `SaleReturnDetail`.
- `customer` llega vacío (`""`) en la hoja de liquidación y en los descuentos si la venta no tiene cliente.
- `plate` ya no viene en ninguna respuesta y se ignora si se envía. Ya no existe el error `services.N.plate`.

**Qué debe hacer el frontend**

Ya está hecho en este mismo cambio, Juan solo debe revisarlo:

- **Vender:** se puede cobrar sin cliente y salió la columna «Placa». Un cliente nuevo que queda en blanco no se envía.
- **Recibo:** omite la línea del cliente si no hay, y ya no muestra la placa.
- **Historial de ventas y hoja de liquidación:** muestran «Sin cliente».
- **Tipos:** se actualizaron `Sale`, `SaleInput`, `SaleService` y `SettledService` en `frontend/src/api/types.ts`.

Al construir la pantalla de **devoluciones**, tener en cuenta que `customer` puede ser `null`.

## 2026-11-05 · La descripción del servicio ya no es obligatoria (0.10.0)

**Qué cambió**

- En `POST /sales`, `services[].details` siempre es opcional, también en el tipo «Otro», para no demorar la venta. Ya no existe el error `services.N.details` que pedía escribir qué se hizo.
- Se eliminó `needs_description` de `/service-types` y de la base de datos, con una migración en `workshop`.

**Cambio incompatible:** `needs_description` ya no viene en las respuestas de `/service-types`, y si se envía se ignora.

**Qué debe hacer el frontend**

Ya está hecho en este mismo cambio, Juan solo debe revisarlo:

- En **Vender**, el campo «Qué se hizo» dice siempre «Opcional».
- En **Configuración → Taller** se quitaron la casilla «Pide descripción en la venta» y su etiqueta en la lista.
- `needs_description` salió de `ServiceType` en `frontend/src/api/types.ts`.

## 2026-11-05 · Eliminar productos sin historial y evitar duplicados (0.10.0)

**Qué cambió**

- **`DELETE /products/{id}`** (solo el dueño): elimina un producto que nunca se usó y libera su código. Responde 204. Si ya tiene movimientos, compras, ventas, consignaciones o cambios de precio, responde el nuevo 409 `product_has_history` y no borra nada.
- **Productos duplicados:** `POST /products` y `POST /inventory/initial-count/items` rechazan otro producto con el mismo nombre, marca y moto, sin importar mayúsculas, tildes o espacios. Antes se creaba sin aviso, con un código numerado como `FRE-PUL-PAS2`. El error llega en `fields.name`.
- `PATCH /products/{id}` aplica la misma regla al renombrar o reactivar. Los duplicados que ya existan se pueden seguir editando, renombrar o desactivar. No se borran ni se fusionan solos.

**Cambio incompatible:** una petición que antes creaba un duplicado ahora responde 400. La pantalla ya muestra los errores de `fields`, así que no debería romperse.

**Qué debe hacer el frontend**

- En **Productos** (solo el dueño), agregar **Eliminar** con confirmación, deshabilitado mientras responde.
- Manejar 409 `product_has_history`: mostrar `message` y ofrecer desactivar el producto.
- Comprobar que el error de `fields.name` se vea junto al nombre, también en el formulario del inventario inicial.

## 2026-11-05 · Devoluciones y descuentos por mal servicio (0.9.0)

**Qué cambió**

- **Devoluciones parciales o totales:** `POST /sales/{id}/returns` registra productos por unidades y servicios completos, con su causa, su motivo y el reembolso. Responde 201, o 200 si se repite la `idempotency_key`.
  - Los productos `resellable` vuelven al inventario; los `damaged` quedan anotados y no entran a las existencias.
  - Se reembolsa al precio cobrado en la venta, desde la caja abierta de hoy. El reembolso puede repartirse por medios y debe sumar exactamente el total.
- **Causas:** `other` la registra cualquiera y la asume el local. `bad_service` es solo del dueño, con servicios de un solo mecánico: se le descuenta la mano de obra devuelta más los repuestos `damaged`.
- **Liquidación:** los descuentos se restan de la parte del mecánico, los más antiguos primero. Si no alcanza, el saldo pasa a la siguiente liquidación; si se descuenta todo, no sale dinero de la caja.
  - La vista previa trae `share` y `deductions_total`, y `amount` ya es neto.
  - Las liquidaciones traen `deductions_total` y el detalle trae `deductions`.
- **Consultas nuevas:** `GET /sale-returns` y `GET /sale-returns/{id}` (cualquier usuario con sesión; el descuento solo lo ve el dueño) y `GET /mechanic-deductions` con `?mechanic=` y `?pending=true` (solo el dueño).
- **Campos nuevos:** `returned_quantity` en los productos de la venta, `is_returned` en sus servicios y `sale_return` en los movimientos de caja.
- **Anulación:** una venta con devoluciones ya no se puede anular y responde el nuevo 409 `sale_has_returns`.
- **Caja:** `sale_refund` ahora también lo generan las devoluciones.
- **Base de datos:** esta versión trae migraciones en `sales`, `cash` y `workshop`. Se aplican solas al arrancar, con el respaldo previo.

Ningún cambio incompatible: solo se agregan rutas, campos y casos de error. Sin descuentos, `amount` vale lo mismo que antes.

**Pendiente:** el límite de tiempo para devolver (hasta el cierre del mes siguiente) todavía no se valida. Llegará con los cierres de mes.

**Qué debe hacer el frontend**

- En el **detalle de la venta**, agregar la acción **Devolver**:
  - Ofrecer hasta `quantity - returned_quantity` por producto y deshabilitar los servicios con `is_returned`.
  - Preguntar el estado de cada producto (`condition`), que es obligatorio, y pedir causa y motivo.
  - Mostrar `bad_service` solo al dueño, con servicios de un solo mecánico.
  - Calcular el total y repartir el reembolso por medios. Generar un `idempotency_key` por devolución y deshabilitar el botón mientras responde.
  - Manejar 409 `sale_voided` y 409 `cash_session_closed`, y mostrar los errores de `fields` (`items.N.quantity`, `services`, `refunds`).
- Pantalla o sección **Devoluciones** con `GET /sale-returns` y su detalle.
- En **Ventas**, al anular: mostrar el `message` del 409 `sale_has_returns`.
- En **Liquidación del día**: mostrar `share`, `deductions_total` y `amount`; permitir pagar aunque `amount` sea 0, porque registra el descuento; e incluir `deductions` en la hoja del mecánico.
- Mostrar el saldo pendiente de cada mecánico con `GET /mechanic-deductions?pending=true`, porque la vista previa no lista a quien no tiene servicios ese día.
- En **Caja**: agregar `sale_return` a `CashMovement` (`frontend/src/api/types.ts`).
- Usar los tipos de [Devoluciones](API.md#devoluciones) y [Liquidación](API.md#liquidación-diaria-de-mecánicos).

## 2026-11-05 — Empaquetado y respaldo previo a migraciones

- El backend puede distribuirse congelado con PyInstaller dentro del instalador de Tauri.
- Antes de migraciones pendientes sobre una base existente se crea y verifica un respaldo local consistente con la clave Django y un manifiesto. Si falla, el arranque se detiene antes de migrar.
- No cambian endpoints, respuestas ni permisos. **Ninguna acción para el frontend de la API**; el escritorio mantiene su pantalla de preparación hasta que responde salud.
- Estas copias locales no sustituyen los respaldos externos pendientes. Guía: [PUBLICACION.md](../PUBLICACION.md).

## 2026-11-03 · Liquidación diaria de mecánicos (0.8.0)

**Qué cambió**

- **Liquidación del día** (solo el dueño):
  - `GET /mechanic-settlements/daily?date=` muestra, por mecánico, los servicios sin pagar de ese día (hoy por defecto), su mano de obra, el porcentaje y lo que se le debe, más el `total` que saldría de la caja.
  - `POST /mechanic-settlements/daily` con `mechanic` (y opcionales `date` y `method`) le paga su parte. Responde 201 con los servicios pagados para imprimir la hoja.
- Se paga **solo el porcentaje de la mano de obra**; los repuestos son 100 % del local. El porcentaje aplicado queda guardado y el valor se redondea al peso.
- **Cada servicio se paga una sola vez.** Lo que se venda después de pagarle ese día se liquida aparte, y los servicios de ventas anuladas no cuentan.
- El pago sale de la **caja abierta de hoy**, aunque se liquide un día anterior, con el tipo de movimiento nuevo `mechanic_payment` («Pago a mecánico»). Los movimientos de caja traen el campo nuevo `mechanic_settlement`.
- **Historial:** `GET /mechanic-settlements` (paginado, con `?mechanic=`, `?date_from=` y `?date_to=`) y `GET /mechanic-settlements/{id}` para reimprimir.
- **Anulación:** una venta con servicios ya pagados al mecánico ya no se puede anular y responde 409 `sale_has_settled_services`. Se corregirá con las devoluciones de la siguiente versión.
- Errores nuevos: 409 `nothing_to_settle` y 409 `sale_has_settled_services`.

Ningún cambio incompatible: solo se agregan rutas, campos y casos de error.

**Qué debe hacer el frontend**

- Pantalla **Liquidación del día** (solo el dueño):
  - Usar `GET /mechanic-settlements/daily`, con selector de fecha para días anteriores.
  - Poner un botón **Pagar** por mecánico, con confirmación y el medio de pago (efectivo por defecto), y deshabilitarlo mientras responde.
  - Mostrar la hoja con los servicios pagados.
  - Antes de pagar, consultar `GET /cash-sessions/current`. Manejar 409 `cash_session_closed` y 409 `nothing_to_settle`: en ese caso, volver a cargar la vista previa.
- Pantalla **Historial de liquidaciones** (solo el dueño), con filtros por mecánico y fechas y detalle para reimprimir.
- En **Ventas**, al anular: mostrar el `message` del 409 `sale_has_settled_services`.
- En **Caja**: agregar `mechanic_payment` a `CashMovementKind` y `mechanic_settlement` a `CashMovement` (`frontend/src/api/types.ts`).
- Usar los tipos `DailySettlement`, `SettlementPreviewRow`, `SettleInput`, `MechanicSettlement`, `MechanicSettlementDetail` y `SettledService` de [API.md](API.md#liquidación-diaria-de-mecánicos).

## 2026-11-03 · Servicios de taller y mecánicos (0.7.0)

**Qué cambió**

- **Tipos de servicio:** `/service-types`, con código numérico único (`101`), nombre, precio sugerido de mano de obra y `needs_description` para el tipo «Otro». Todos consultan; solo el dueño crea y edita. No se borran: se desactivan. Ordenados por código y sin paginar.
- **Mecánicos:** `/mechanics`. Son registros de empleado, sin usuario. Cada uno puede tener su porcentaje de la mano de obra (`labor_percentage`) o usar el general. **El vendedor recibe el nombre, pero no los porcentajes.**
- **Datos del negocio:** campo nuevo `default_mechanic_percentage` (0 a 100, por defecto 60), el porcentaje general de los mecánicos. Solo el dueño lo cambia.
- **Servicios en la venta:** `POST /sales` acepta `services`, cada uno con `service_type`, `mechanic` (obligatorio), `plate` opcional (se guarda como `ABC12D`) y `details`. La mano de obra es el precio sugerido; solo el dueño puede enviar `labor_price` distinto.
  - `items` ahora es **opcional**: una venta puede ser solo de servicios, pero necesita al menos un producto o un servicio.
  - Los repuestos usados van en `items`, como cualquier producto: se descuentan una vez.
  - El total y los pagos incluyen la mano de obra.
  - `SaleDetail` trae `services`; la lista trae `services_count`; `GET /sales` acepta `?mechanic=`.
  - Anular una venta reembolsa también los servicios; quedan en su historial.
- **Consumo del taller:** `POST /inventory/workshop-use` (solo el dueño) saca unidades de un insumo de taller sin cobrarlas. Tipo de movimiento nuevo `workshop_use` («Consumo del taller»).
- Errores nuevos por línea: `services.N.details`, `services.N.labor_price`, `services.N.mechanic`, `services.N.service_type` y `services.N.plate`.

**Cambio incompatible**

- El mensaje de la venta vacía cambió de «Agrega al menos un producto.» a **«Agrega al menos un producto o un servicio.»**. Sigue en `fields.items` y con el mismo `code`; solo afecta si la ventana compara el texto.

**Qué debe hacer el frontend**

- Pantallas de **Configuración → Tipos de servicio y Mecánicos** (solo el dueño), con `?include_inactive=true` para ver los desactivados. En mecánicos, el porcentaje es opcional: vacío envía `null` y se muestra `effective_percentage`.
- En **Datos del negocio**: agregar el campo «Porcentaje general de los mecánicos».
- En la **pantalla de venta**:
  - Cargar `/service-types` y `/mechanics` al abrirla. Si lo escrito en el buscador son solo números, ofrecer el servicio con ese código; `/catalog/search` sigue siendo solo de productos.
  - Al agregar un servicio, pedir el mecánico (obligatorio), la placa (opcional) y la descripción si `needs_description` es `true`. Mostrar el valor editable solo al dueño.
  - Sumar la mano de obra al total y enviar `services` en `POST /sales`. Permitir cobrar con el carrito solo de servicios.
- En el **detalle y el recibo de la venta**: mostrar los servicios con tipo, mecánico, placa y mano de obra.
- **Consumo del taller** (solo el dueño): formulario con producto (solo `?workshop_supply=true`), cantidad y motivo.
- En el **kárdex**: agregar `workshop_use` a `MovementKind` (`frontend/src/api/types.ts`).
- Usar los tipos `ServiceType`, `ServiceTypeInput`, `Mechanic`, `MechanicInput`, `SaleService`, `WorkshopUseInput` y los cambios de `Sale`, `SaleDetail`, `SaleInput` y `BusinessSettings` de [API.md](API.md#taller-tipos-de-servicio-y-mecánicos).

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
