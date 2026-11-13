# API del backend: guía para el frontend

Contrato vigente de la API local de Django. Se actualiza con cada cambio del backend; los cambios se resumen en [CAMBIOS.md](CAMBIOS.md).

Versión del backend: **0.11.0**.

## Conexión

| Dato | Valor |
| --- | --- |
| URL base | `http://127.0.0.1:<puerto>/api/v1` |
| Puerto | Lo elige Tauri al iniciar el sidecar; en desarrollo, `8765` |
| Credencial del programa | Cabecera `X-Punto-Moto-Token` en **todas** las llamadas |
| Sesión del usuario | Cabecera `Authorization: Token <token>` después de iniciar sesión |
| Formato | JSON (`Content-Type: application/json`) |
| Fechas | ISO 8601 con zona horaria de Colombia, por ejemplo `2026-10-30T18:56:04.523678-05:00` |
| Dinero | **Pesos colombianos enteros**, sin decimales: `25000` es $25.000. Se envía y se muestra tal cual, sin multiplicar ni dividir |
| Listados largos | Paginados: `?page=2&page_size=100` (50 por defecto, máximo 200) |

Hay **dos llaves** distintas:

- **Credencial del programa** (`X-Punto-Moto-Token`): Tauri la genera en cada inicio y se la entrega al backend y a la ventana. Demuestra que la llamada viene del programa. El mecanismo para pasarla a React se definirá en `desktop/`.
- **Token de sesión** (`Authorization`): lo devuelve el backend al iniciar sesión. Identifica al usuario.

Ninguna de las dos se guarda en `localStorage`: se mantienen en memoria. Al cerrar el programa se pierden y hay que iniciar sesión otra vez; el backend también borra todas las sesiones al arrancar.

Orígenes aceptados: `http://tauri.localhost` (ventana de Tauri en Windows), `tauri://localhost` (Linux) y `http://localhost:5173` (Vite). Cualquier otro origen recibe 403.

### Desarrollo sin Tauri

```bash
cd backend
.venv/Scripts/python manage.py migrate
PUNTO_MOTO_DEBUG=1 .venv/Scripts/python manage.py runserver 127.0.0.1:8765
```

Sin credencial del programa configurada, el backend no exige `X-Punto-Moto-Token`, así que el frontend puede llamarlo desde Vite directamente. **El token de sesión sí se exige siempre**: crea el dueño con `POST /setup/owner` o con `manage.py createsuperuser`.

### Ejemplo de cliente

```ts
const API_BASE = `http://127.0.0.1:${port}/api/v1`;
let sessionToken: string | null = null;   // solo en memoria

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Punto-Moto-Token": appToken,
      ...(sessionToken ? { Authorization: `Token ${sessionToken}` } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && body.code !== "invalid_app_token") {
      sessionToken = null;   // la sesión terminó: volver a la pantalla de inicio de sesión
    }
    throw body as ApiError;
  }
  return body as T;
}
```

## Flujo de inicio del programa

```text
GET /health ──► GET /setup/status
                   │
       needs_owner: true ──► Asistente: POST /setup/owner ──► { token, user }
                   │
       needs_owner: false ─► Pantalla de inicio: POST /auth/login ──► { token, user }
                                                          │
                                   Guardar token en memoria y mostrar las pantallas según user.role
```

## Roles y permisos

| Rol | `role` | Puede |
| --- | --- | --- |
| Dueño | `owner` | Todo: administrar usuarios, cambiar datos del negocio, cambiar precios (también dentro de una venta), ver costos, ajustar inventario, cargar y terminar el inventario inicial, registrar compras y abonos a proveedores, abrir y cerrar la caja, registrar gastos y retiros, anular ventas y manejar la consignación. En los próximos módulos, restaurar respaldos |
| Vendedor | `seller` | Vender a precio de catálogo, crear y buscar clientes, consultar ventas y ver si la caja está abierta; no ve costos ni montos de caja, no administra usuarios ni cambia datos del negocio |

La interfaz debe **ocultar** las acciones que el rol no permite, usando `user.role` de `/auth/me` o del inicio de sesión. Aun así, el backend las rechaza con 403 `permission_denied`, por lo que ocultar el botón no es la única protección.

## Errores

Todas las respuestas de error tienen la misma forma:

```ts
interface ApiError {
  code: string;                       // código estable para decidir qué hacer
  message: string;                    // texto en español para mostrar al usuario
  fields: Record<string, string[]>;   // errores por campo; vacío si no aplica
}
```

```json
{
  "code": "validation_error",
  "message": "Revisa los datos marcados.",
  "fields": { "name": ["El nombre del negocio es obligatorio."] }
}
```

| HTTP | `code` | Cuándo ocurre | Qué hacer en la interfaz |
| --- | --- | --- | --- |
| 400 | `validation_error` | Datos inválidos, o un filtro de la URL que no es válido (por ejemplo `?category=abc`) | Mostrar cada mensaje de `fields` junto a su campo; `non_field_errors` va arriba del formulario |
| 401 | `not_authenticated` | No se envió el token de sesión | Ir a la pantalla de inicio de sesión |
| 401 | `authentication_failed` | Token de sesión inválido o vencido (cierre de sesión, programa reiniciado, usuario desactivado o contraseña cambiada) | Borrar el token y volver a la pantalla de inicio de sesión |
| 401 | `invalid_app_token` | Falta la credencial del programa o no coincide | Error de la aplicación, no del usuario: pedir reiniciar el programa |
| 403 | `permission_denied` | El rol del usuario no permite la acción | Mostrar `message`; la acción no debió estar visible |
| 403 | `origin_not_allowed` | Llamada desde un origen no permitido | Solo debería verse en desarrollo; revisar el puerto de Vite |
| 404 | `not_found` | Ruta o registro inexistente | Mostrar `message` |
| 409 | `initial_count_finished` | Se intenta cargar un producto al inventario inicial o terminarlo cuando ya terminó | Mostrar `message`, volver a consultar `GET /inventory/initial-count` y ocultar la pantalla de conteo |
| 409 | `purchase_received` | Se intenta editar, borrar o recibir otra vez una compra ya recibida | Mostrar `message` y volver a cargar la compra |
| 409 | `initial_count_open` | Se intenta vender o entregar en consignación mientras el inventario inicial sigue abierto | Mostrar `message`; el dueño debe terminar el conteo |
| 409 | `cash_session_closed` | No hay caja abierta (o ya se cerró) y se intenta vender, anular, devolver, abonar o pagar con fecha de hoy, registrar un gasto o cerrar otra vez | Mostrar `message` y volver a consultar `GET /cash-sessions/current`; el dueño debe abrir la caja |
| 409 | `product_has_history` | Se intenta eliminar un producto que ya se usó | Mostrar `message` y ofrecer desactivarlo |
| 409 | `sale_voided` | Se intenta anular una venta ya anulada o registrar una devolución sobre ella | Mostrar `message` y volver a cargar la venta |
| 409 | `sale_has_settled_services` | Se intenta anular una venta con servicios que ya se le pagaron al mecánico | Mostrar `message`; esa venta se corrige con una devolución |
| 409 | `sale_has_returns` | Se intenta anular una venta que ya tiene devoluciones | Mostrar `message`; lo que falte se corrige con otra devolución |
| 409 | `nothing_to_settle` | Se intenta pagar a un mecánico que no tiene servicios sin pagar ese día (por ejemplo, un doble clic) | Mostrar `message` y volver a consultar la liquidación del día |
| 405 | `method_not_allowed` | Método no soportado en la ruta | Error de programación |
| 429 | `throttled` | Demasiados intentos de inicio de sesión (más de 10 por minuto) | Mostrar `message` y deshabilitar el botón un momento |
| 500 | `server_error` | Fallo inesperado del backend | Mostrar `message`; la operación no se completó y se puede reintentar |

## Tipos compartidos

```ts
type Role = "owner" | "seller";

interface User {
  id: number;
  username: string;          // siempre en minúsculas
  first_name: string;
  last_name: string;
  display_name: string;      // nombre completo o, si no tiene, el username
  role: Role;
  role_label: string;        // "Dueño" o "Vendedor"
  is_active: boolean;
  last_login: string | null;
}

interface Session {
  token: string;
  user: User;
}

interface Paginated<T> {
  count: number;             // total de registros con los filtros aplicados
  next: string | null;       // URL de la página siguiente
  previous: string | null;
  results: T[];
}
```

## Endpoints

Columna **Acceso**: *Abierto* no pide sesión; *Sesión* pide cualquier usuario; *Dueño* pide rol `owner`. Todos piden la credencial del programa.

| Método y ruta | Acceso | Descripción |
| --- | --- | --- |
| `GET /health` | Abierto | Estado del backend |
| `GET /setup/status` | Abierto | Si falta crear el dueño |
| `POST /setup/owner` | Abierto, una sola vez | Crea el primer dueño e inicia su sesión |
| `POST /auth/login` | Abierto | Inicia sesión |
| `POST /auth/logout` | Sesión | Cierra la sesión |
| `GET /auth/me` | Sesión | Usuario conectado |
| `GET /users` | Dueño | Lista de usuarios |
| `POST /users` | Dueño | Crea un usuario |
| `GET /users/{id}` | Dueño | Un usuario |
| `PATCH /users/{id}` | Dueño | Edita nombre, rol o estado |
| `POST /users/{id}/set-password` | Dueño | Asigna una contraseña nueva |
| `GET /settings/business` | Sesión | Datos del negocio |
| `PUT` o `PATCH /settings/business` | Dueño | Guarda los datos del negocio |
| `GET /catalog/categories`, `/catalog/brands`, `/catalog/motos` | Sesión | Tipos, marcas y motos activos |
| `POST /catalog/categories`, `/catalog/brands`, `/catalog/motos` | Dueño | Crea un tipo, marca o moto |
| `GET` y `PATCH /catalog/{categories,brands,motos}/{id}` | Sesión / Dueño | Consulta o edita uno |
| `GET /products` | Sesión | Catálogo paginado con filtros |
| `POST /products` | Dueño | Crea un producto |
| `GET /products/{id}` | Sesión | Un producto |
| `PATCH /products/{id}` | Dueño | Edita un producto, incluido su precio |
| `DELETE /products/{id}` | Dueño | Elimina un producto que nunca se usó |
| `GET /catalog/search` | Sesión | Buscador de la pantalla de venta |
| `GET /catalog/code-suggestion` | Dueño | Sugiere un código mientras se llena el formulario |
| `GET /inventory/movements` | Sesión | Movimientos de inventario (kárdex) paginados |
| `POST /inventory/adjustments` | Dueño | Ajuste físico de existencias con motivo |
| `POST /inventory/workshop-use` | Dueño | Saca un insumo de taller por consumo interno |
| `GET /inventory/initial-count` | Sesión | Estado y avance del inventario inicial |
| `POST /inventory/initial-count/items` | Dueño | Crea un producto con su cantidad contada |
| `POST /inventory/initial-count/finish` | Dueño | Termina el inventario inicial |
| `GET /suppliers` | Dueño | Proveedores con lo que se les debe |
| `POST /suppliers` | Dueño | Crea un proveedor |
| `GET` y `PATCH /suppliers/{id}` | Dueño | Consulta o edita un proveedor |
| `GET /purchases` | Dueño | Compras paginadas con filtros |
| `POST /purchases` | Dueño | Crea una compra en borrador |
| `GET /purchases/{id}` | Dueño | Una compra con sus productos y abonos |
| `PATCH /purchases/{id}` | Dueño | Edita el borrador |
| `DELETE /purchases/{id}` | Dueño | Borra el borrador |
| `POST /purchases/{id}/receive` | Dueño | Recibe la compra, con un abono opcional |
| `GET /supplier-payments` | Dueño | Abonos a proveedores paginados |
| `POST /supplier-payments` | Dueño | Registra un abono |
| `GET /supplier-payments/{id}` | Dueño | Un abono con su reparto entre compras |
| `GET`, `POST /customers` | Sesión | Clientes paginados con búsqueda; crea un cliente |
| `GET` y `PATCH /customers/{id}` | Sesión | Consulta o edita un cliente |
| `POST /sales` | Sesión | Confirma una venta pagada completa |
| `GET /sales` | Sesión | Ventas paginadas con filtros |
| `GET /sales/{id}` | Sesión | Una venta con sus líneas y pagos (recibo) |
| `GET /sales/summary` | Dueño | Resumen neto de ventas por tipo, servicio y producto |
| `POST /sales/{id}/void` | Dueño | Anula una venta |
| `POST /sales/{id}/returns` | Sesión (mal servicio: dueño) | Registra una devolución parcial o total |
| `GET /sale-returns` y `/sale-returns/{id}` | Sesión | Devoluciones; una con sus líneas |
| `GET /service-types`, `/mechanics` | Sesión | Tipos de servicio y mecánicos activos |
| `POST /service-types`, `/mechanics` | Dueño | Crea un tipo de servicio o un mecánico |
| `GET` y `PATCH /service-types/{id}`, `/mechanics/{id}` | Sesión / Dueño | Consulta o edita uno |
| `DELETE /mechanics/{id}` | Dueño | Elimina un mecánico sin historial (409 si ya se usó) |
| `GET /mechanic-settlements/daily` | Dueño | Lo que se le debe a cada mecánico en un día |
| `POST /mechanic-settlements/daily` | Dueño | Le paga a un mecánico su parte del día |
| `GET /mechanic-settlements` y `/mechanic-settlements/{id}` | Dueño | Liquidaciones pagadas; una con sus servicios |
| `GET /mechanic-deductions` | Dueño | Descuentos por mal servicio y su saldo |
| `GET /cash-sessions/current` | Sesión | Si la caja está abierta; el dueño recibe también sus montos |
| `GET`, `POST /cash-sessions` | Dueño | Historial de cajas; abre la caja |
| `GET /cash-sessions/{id}` | Dueño | Una caja con su resumen |
| `POST /cash-sessions/{id}/close` | Dueño | Cierra la caja con el efectivo contado |
| `GET`, `POST /cash-movements` | Dueño | Movimientos de caja; registra un gasto o un retiro |
| `GET`, `POST /consignees` | Dueño | Locales en consignación con su saldo |
| `GET` y `PATCH /consignees/{id}` | Dueño | Consulta o edita un local |
| `GET /consignees/{id}/pending-items` | Dueño | Lo que el local todavía tiene |
| `GET`, `POST /consignment-deliveries` y `GET /consignment-deliveries/{id}` | Dueño | Entregas en consignación |
| `GET`, `POST /consignment-reports` y `GET /consignment-reports/{id}` | Dueño | Reportes de lo vendido y devuelto |
| `GET`, `POST /consignee-payments` y `GET /consignee-payments/{id}` | Dueño | Pagos de los locales |

### Estado del backend

`GET /health`

Tauri lo consulta para saber cuándo mostrar las pantallas. El frontend puede usarlo para mostrar la versión.

```json
{ "status": "ok", "version": "0.11.0", "server_time": "2026-10-30T18:56:04.472609-05:00" }
```

```ts
interface Health {
  status: "ok";
  version: string;
  server_time: string;
}
```

### Configuración inicial

`GET /setup/status`

```json
{ "needs_owner": true }
```

`POST /setup/owner` crea el primer usuario, **siempre con rol dueño** aunque se envíe otro, y devuelve la sesión abierta (201). Después de creado el dueño responde 403 `permission_denied`.

```json
{ "username": "dueno", "first_name": "Carlos", "last_name": "Pérez", "password": "taller-moto-2026" }
```

```json
{ "token": "9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b", "user": { "id": 1, "username": "dueno", "role": "owner", "...": "..." } }
```

Mismas reglas de campos que `POST /users`, sin `role`.

### Sesión

`POST /auth/login`

```json
{ "username": "Ana", "password": "taller-moto-2026" }
```

Responde `Session` (200). El usuario no distingue mayúsculas ni espacios alrededor.

- Cada inicio de sesión **reemplaza** el token anterior del mismo usuario.
- Si el usuario no existe, la contraseña está mal o el usuario está desactivado, el error es siempre el mismo, para no revelar cuál falló:

```json
{ "code": "validation_error", "message": "Revisa los datos marcados.", "fields": { "non_field_errors": ["Usuario o contraseña incorrectos."] } }
```

- Más de 10 intentos por minuto: 429 `throttled`.

`POST /auth/logout`: responde 204 sin cuerpo. El token deja de servir.

`GET /auth/me`: responde `User`.

### Usuarios (solo el dueño)

`GET /users`: lista de `User`, ordenada por `username`. `GET /users/{id}`: un `User`.

`POST /users` responde el `User` creado (201).

```json
{ "username": "ana", "first_name": "Ana", "last_name": "Ruiz", "role": "seller", "password": "taller-moto-2026" }
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `username` | texto | Obligatorio; se guarda en minúsculas y sin espacios alrededor; único sin distinguir mayúsculas; máximo 150 |
| `first_name`, `last_name` | texto | Opcionales; máximo 150 |
| `role` | `Role` | Obligatorio |
| `password` | texto | Obligatorio; mínimo 8 caracteres, no solo números, no una contraseña común y no parecida al usuario o al nombre |

`PATCH /users/{id}` responde el `User` actualizado.

```json
{ "role": "seller", "is_active": false }
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `first_name`, `last_name` | texto | Opcionales |
| `role` | `Role` | Opcional |
| `is_active` | booleano | `false` desactiva el usuario y **cierra su sesión** |

- `username` y la contraseña no se cambian aquí.
- **Debe quedar al menos un dueño activo.** Quitarle el rol o desactivar al último responde 400 con `fields.non_field_errors: ["Debe quedar al menos un dueño activo."]`.
- No hay `DELETE` (responde 405): un usuario con operaciones se desactiva.

`POST /users/{id}/set-password` responde 204 y **cierra la sesión** que ese usuario tuviera abierta.

```json
{ "new_password": "repuestos-nuevos-9" }
```

Errores: `validation_error` con `fields.new_password` si no cumple las reglas de contraseña.

### Datos del negocio

Datos que se imprimen en el encabezado del recibo. Hay un solo registro por instalación; la primera vez todos los campos de texto llegan vacíos. **Cualquier usuario los consulta; solo el dueño los modifica** (403 `permission_denied` para el vendedor).

`GET /settings/business`

```json
{
  "name": "Punto Moto",
  "tax_id": "900123456",
  "address": "Calle 1 # 2-3",
  "phone": "3001234567",
  "receipt_footer": "Gracias por su compra",
  "default_mechanic_percentage": 60,
  "updated_at": "2026-10-30T18:56:04.523678-05:00"
}
```

`PUT /settings/business` guarda el formulario completo. `PATCH /settings/business` cambia solo los campos enviados. Ambos responden con el registro actualizado.

```json
{ "name": "Punto Moto", "phone": "3001234567" }
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `name` | texto | Obligatorio en `PUT` y al enviarlo en `PATCH`; máximo 120; se recortan espacios |
| `tax_id` | texto | Opcional; máximo 30 (NIT o cédula) |
| `address` | texto | Opcional; máximo 200 |
| `phone` | texto | Opcional; máximo 40 |
| `receipt_footer` | texto | Opcional; texto al pie del recibo, sin límite |
| `default_mechanic_percentage` | entero | De 0 a 100; por defecto 60. Parte de la mano de obra para los mecánicos que no tienen porcentaje propio; el resto es del local |
| `updated_at` | fecha | Solo lectura |

Errores: `validation_error` con `fields.name` si el nombre llega vacío, o con el campo que exceda su longitud.

```ts
interface BusinessSettings {
  name: string;
  tax_id: string;
  address: string;
  phone: string;
  receipt_footer: string;
  default_mechanic_percentage: number;   // 0 a 100
  updated_at: string;
}

type BusinessSettingsInput = Omit<BusinessSettings, "updated_at">;
```

### Catálogo: tipos, marcas y motos

Listas que alimentan los desplegables del formulario de producto. **Todos consultan; solo el dueño crea y edita.** No se borran (`DELETE` responde 405): se desactivan con `is_active: false`. Los listados no están paginados y muestran solo lo activo; la pantalla de administración pide `?include_inactive=true`.

| Ruta | Campos |
| --- | --- |
| `/catalog/categories` | `name`, `abbreviation` (sigla del tipo, primera parte del código: `FRE`) |
| `/catalog/brands` | `name` |
| `/catalog/motos` | `name`, `abbreviation` (sigla de la moto, segunda parte del código: `PUL`) |

`POST /catalog/motos`

```json
{ "name": "Boxer CT 100", "abbreviation": "box" }
```

```json
{ "id": 3, "name": "Boxer CT 100", "abbreviation": "BOX", "is_active": true }
```

| Campo | Reglas |
| --- | --- |
| `name` | Obligatorio; máximo 80; único sin distinguir mayúsculas; se limpian los espacios |
| `abbreviation` | De 2 a 8 letras; se acepta en minúsculas y se guarda en mayúsculas. En tipos es única; en motos puede repetirse entre versiones (Pulsar 180 y Pulsar 200 usan `PUL`) y `UNI` está reservada para los universales |
| `is_active` | Opcional; `false` lo oculta de los desplegables |

Errores: `fields.name` con "Ya existe un tipo con ese nombre." (o marca, o moto), `fields.abbreviation` con "Ya existe un tipo con esa sigla." o el formato inválido.

```ts
interface Category { id: number; name: string; abbreviation: string; is_active: boolean; }
interface Brand    { id: number; name: string; is_active: boolean; }
interface MotoModel { id: number; name: string; abbreviation: string; is_active: boolean; }
```

### Productos

Cada producto tiene un **código interno** corto (no hay escáner): letras, números y guiones, en mayúsculas. `FRE-PUL-PAS` y `FREPULPAS` son el mismo código, así que no pueden existir los dos.

**Todos consultan; solo el dueño crea y edita**, incluido el precio. **El vendedor no recibe `cost_price` ni `sells_below_cost`**: los campos no vienen en la respuesta.

Todos reciben `stock` (existencia actual) e `is_low_stock`. Un producto que nunca tuvo movimientos tiene `stock: 0`. Las existencias **no se envían ni se editan** en `POST` o `PATCH /products`: solo cambian con el [inventario](#inventario).

Al [recibir una compra](#compras-y-proveedores), `cost_price` pasa a ser el costo promedio y, si el costo subió, `sale_price` sube los mismos pesos, redondeado a miles. Volver a consultar los productos después de recibir.

```ts
interface Product {
  id: number;
  code: string;                    // "FRE-PUL-PAS"
  name: string;
  category: Category;
  brand: Brand | null;
  moto: MotoModel | null;          // null = repuesto universal
  compatible_motos: MotoModel[];
  is_universal: boolean;
  cost_price?: number;             // solo el dueño
  sale_price: number;
  sells_below_cost?: boolean;      // solo el dueño: mostrar advertencia
  stock: number;                   // unidades disponibles
  min_stock: number;
  is_low_stock: boolean;           // stock <= min_stock: hay que reponer
  location: string;
  is_workshop_supply: boolean;     // insumo de taller, incluido en la mano de obra
  is_active: boolean;
  updated_at: string;
}

interface ProductInput {
  code?: string;                   // vacío u omitido: se genera automáticamente
  name: string;
  category: number;                // ids
  brand?: number | null;
  moto?: number | null;
  compatible_motos?: number[];
  cost_price: number;
  sale_price: number;
  min_stock?: number;
  location?: string;
  is_workshop_supply?: boolean;
  is_active?: boolean;
}
```

`GET /products` responde `Paginated<Product>`, ordenado por nombre.

| Filtro | Ejemplo | Resultado |
| --- | --- | --- |
| `q` | `?q=pastillas pulsar` | Todas las palabras en el nombre, la marca o las motos, sin tildes |
| `category` | `?category=3` | Solo ese tipo |
| `moto` | `?moto=2` | Esa moto como principal **o compatible** |
| `workshop_supply` | `?workshop_supply=true` | Solo insumos de taller |
| `include_inactive` | `?include_inactive=true` | Incluye los desactivados |
| `ordering` | `?ordering=-code` | `name`, `code`, `sale_price` o `updated_at`; con `-` al revés |

`POST /products` responde el `Product` creado (201). `PATCH /products/{id}` responde el `Product` actualizado.

**No se repiten.** No puede haber dos productos con el mismo **nombre, marca y moto**; no importan mayúsculas, tildes ni espacios de más. Un código distinto no evita la regla. El mismo nombre con otra marca u otra moto sí es válido. También aplica al [inventario inicial](#inventario), al renombrar y al reactivar. Un duplicado creado antes de esta regla se puede seguir editando, renombrar o desactivar.

**`DELETE /products/{id}`** (solo el dueño) responde **204** sin cuerpo y libera el código. Solo elimina productos **sin historial**: sin movimientos de inventario, compras (aunque sean borrador), ventas, consignaciones ni cambios de precio. Con historial responde 409 `product_has_history` y no borra nada: ese producto se desactiva con `is_active: false`. No se pueden eliminar tipos, marcas ni motos.

```json
{
  "name": "Pastillas de freno Pulsar 180",
  "category": 1,
  "brand": 2,
  "moto": 1,
  "compatible_motos": [4],
  "cost_price": 18000,
  "sale_price": 25000,
  "location": "Estante B2"
}
```

| Campo | Reglas |
| --- | --- |
| `code` | Opcional. Vacío: se genera con la sugerencia. Escrito: se pasa a mayúsculas; solo letras, números y guiones; único sin importar los guiones. Al editar sin enviarlo, se conserva |
| `name` | Obligatorio; máximo 150. Debe empezar por la palabra clave: «Pastillas de freno Pulsar 180» |
| `category` | Obligatorio; un tipo activo |
| `brand`, `moto` | Opcionales; activos. Sin `moto`, el repuesto es universal |
| `compatible_motos` | Opcional; si incluye la moto principal, se descarta de la lista |
| `cost_price` | Obligatorio; entero mayor o igual a cero |
| `sale_price` | Obligatorio; entero mayor que cero. **Puede ser menor que el costo**: se guarda y `sells_below_cost` vale `true` para mostrar la advertencia |
| `min_stock` | Opcional; entero, 0 por defecto |
| `location`, `is_workshop_supply`, `is_active` | Opcionales |

Errores frecuentes en `fields`:

- `code`: "Ya existe un producto con ese código.", "Usa solo letras, números y guiones…" o "No se pudo generar el código: escríbelo o revisa el nombre." (por ejemplo, una llanta sin medida en el nombre).
- `name`: "Este producto ya existe con la misma marca y moto: FRE-PUL-PAS." o "Este producto ya existe desactivado: FRE-PUL-PAS. Actívalo en lugar de crearlo otra vez."
- `sale_price`: "El precio de venta debe ser mayor que cero."
- `category`, `brand`, `moto`: el id no existe o está desactivado.

### Sugerencia de código

`GET /catalog/code-suggestion?category=1&name=Pastillas de freno&moto=1` (solo el dueño). Al editar, agregar `&product=<id>` para que el producto no choque con su propio código.

```json
{ "code": "FRE-PUL-PAS" }
```

| Datos | Sugerencia |
| --- | --- |
| Tipo `FRE`, moto `PUL`, «Pastillas de freno» | `FRE-PUL-PAS` |
| Tipo `ELE`, sin moto, «Bujía NGK» | `ELE-UNI-BUJ` |
| Tipo `LL`, «Llanta 90/90 rin 18» | `LL909018` |
| `FRE-PUL-PAS` ya existe | `FRE-PUL-PAS2` |

Si faltan datos para armarlo responde `{ "code": "" }`. Se recomienda pedirla con una pausa corta mientras el dueño escribe, no con cada tecla.

### Buscador de la pantalla de venta

`GET /catalog/search?q=frepulpas` responde un arreglo de hasta **8** `Product` activos. Con menos de 2 caracteres responde `[]`.

Orden de los resultados:

1. El código exacto, con o sin guiones: `frepulpas` → `FRE-PUL-PAS`.
2. Los códigos que empiezan por lo escrito: `fre-pu` → `FRE-PUL-PAS`, `FRE-PUL-PAS2`…
3. Los productos cuyo nombre, marca, moto o motos compatibles contienen **todas** las palabras, **sin importar tildes ni mayúsculas**: `bujia ngk` encuentra «Bujía C7HSA» de marca NGK; `zapatas pulsar` encuentra unas zapatas de Discover compatibles con Pulsar.

Cada resultado trae `stock`: la pantalla de venta debe mostrar **deshabilitados** los productos con `stock: 0`. Aún no incluye los servicios por número (`101`); se agregarán con el módulo de taller.

### Inventario

Las existencias de cada producto **solo cambian con movimientos**: inventario inicial, compras, ventas, devoluciones, ajustes, consignación y consumo del taller. Cada movimiento guarda la cantidad con signo (positiva entra, negativa sale), la existencia que quedó, quién lo hizo, la fecha y el motivo. Los movimientos no se editan ni se borran: un error se corrige con otro movimiento. **Las existencias nunca quedan en negativo.**

```ts
type MovementKind =
  | "initial_count" | "purchase" | "sale" | "return" | "adjustment" | "consignment_out" | "consignment_return"
  | "workshop_use";

interface InventoryMovement {
  id: number;
  product: { id: number; code: string; name: string };
  kind: MovementKind;
  kind_label: string;              // "Inventario inicial", "Compra", "Venta", "Devolución", "Ajuste", "Entrega en consignación", "Devolución de consignación", "Consumo del taller"
  quantity: number;                // con signo: 5 entra, -2 sale
  unit_cost?: number;              // solo el dueño: costo por unidad en ese momento
  balance_after: number;           // existencia que quedó después del movimiento
  reason: string;                  // motivo del ajuste o "Compra 15 · Distribuidora Andina"; vacío en el inventario inicial
  created_by: string;              // username
  created_at: string;
}

interface AdjustmentInput {
  product: number;
  quantity: number;                // positivo suma, negativo resta; nunca 0
  reason: string;
}

interface InitialCountStatus {
  is_open: boolean;
  finished_at: string | null;
  finished_by: string | null;      // username
  products_counted: number;        // productos con cantidad cargada
  units_counted: number;           // suma de las unidades cargadas
}

type InitialCountItemInput = ProductInput & { quantity: number };
```

**Movimientos.** `GET /inventory/movements` responde `Paginated<InventoryMovement>`, del más reciente al más antiguo. Lo consultan todos; **el vendedor no recibe `unit_cost`**.

| Filtro | Ejemplo | Resultado |
| --- | --- | --- |
| `product` | `?product=7` | Kárdex de un producto |
| `kind` | `?kind=adjustment` | Solo ese tipo |
| `date_from`, `date_to` | `?date_from=2026-11-01&date_to=2026-11-30` | Entre esas fechas, ambas incluidas, en hora de Colombia |

Un filtro inválido (`?kind=robo`, `?date_from=31/10/2026`, `?product=abc`) responde 400 con el campo en `fields`.

**Ajustes (solo el dueño).** `POST /inventory/adjustments` responde el `InventoryMovement` creado (201).

```json
{ "product": 7, "quantity": -1, "reason": "Se dañó en bodega" }
```

| Campo | Reglas |
| --- | --- |
| `product` | Obligatorio; id de un producto |
| `quantity` | Obligatorio; entero distinto de 0 |
| `reason` | Obligatorio; máximo 200; se limpian los espacios |

Errores en `fields`: `quantity` con "La cantidad no puede ser cero." o "Solo hay 2 unidades: no se pueden restar 3."; `reason` si llega vacío.

**Consumo del taller (solo el dueño).** Los insumos de taller (productos con `is_workshop_supply: true`, como grasa, líquido de frenos o limpiadores) no se cobran al cliente: su valor va incluido en la mano de obra. Cuando se abre un envase para el taller se registra su salida con `POST /inventory/workshop-use`, que responde el `InventoryMovement` creado (201) con `kind: "workshop_use"` y cantidad negativa.

```json
{ "product": 44, "quantity": 1, "reason": "Envase abierto para el taller" }
```

| Campo | Reglas |
| --- | --- |
| `product` | Obligatorio; id de un producto marcado como insumo de taller |
| `quantity` | Obligatorio; entero mayor que 0 (unidades que se sacan) |
| `reason` | Opcional; máximo 200 |

Errores en `fields`: `product` con "Este producto no está marcado como insumo de taller."; `quantity` con "Solo hay 2 unidades de LUB-UNI-GRA." o "No hay unidades de LUB-UNI-GRA.".

```ts
interface WorkshopUseInput { product: number; quantity: number; reason?: string; }
```

**Inventario inicial.** Al empezar a usar el programa, el dueño cuenta todo lo que hay en el negocio y lo carga producto por producto. **Mientras el conteo esté abierto no se debe vender**; el dueño lo termina una sola vez.

`GET /inventory/initial-count` responde `InitialCountStatus`. Lo consultan todos: si `is_open` es `true`, la pantalla de venta debe avisar que el conteo no ha terminado.

```json
{ "is_open": true, "finished_at": null, "finished_by": null, "products_counted": 148, "units_counted": 1320 }
```

`POST /inventory/initial-count/items` (solo el dueño) crea el producto y su movimiento de inventario inicial **juntos**: si algo falla, no queda ninguno. Recibe los mismos campos que `POST /products` más `quantity` y responde el `Product` creado (201), ya con su `stock`.

```json
{
  "name": "Bujía NGK C7HSA",
  "category": 2,
  "brand": 5,
  "cost_price": 6000,
  "sale_price": 9000,
  "quantity": 12
}
```

| Campo | Reglas |
| --- | --- |
| Campos de producto | Las mismas reglas de `POST /products`, incluido el código automático |
| `quantity` | Obligatorio; entero mayor o igual a 0. Con 0 se crea el producto sin unidades |

Solo crea productos nuevos. Un producto que ya existe recibe sus unidades con un ajuste.

`POST /inventory/initial-count/finish` (solo el dueño) termina el conteo y responde `InitialCountStatus` (200). Desde ese momento las existencias solo cambian con compras, ventas, devoluciones o ajustes. Pedir una confirmación antes de llamarlo: no se puede deshacer.

Después de terminado, cargar un producto o volver a terminar responde 409 `initial_count_finished`:

```json
{ "code": "initial_count_finished", "message": "El inventario inicial ya terminó: usa compras o ajustes.", "fields": {} }
```

### Compras y proveedores

Todo este módulo es **solo del dueño**: compras y abonos muestran costos. El vendedor recibe 403 `permission_denied` en todas estas rutas.

**Flujo:**

1. **Borrador.** Se elige el proveedor y se agregan los productos con su cantidad y su costo por unidad. Se edita y se puede borrar. **No toca el inventario.**
2. **Recibir.** `POST /purchases/{id}/receive` registra la recepción completa: entran las existencias, se recalcula el costo de cada producto y el total queda fijo. Se puede enviar un abono entregado con la mercancía. Desde aquí la compra **no se edita ni se borra**.
3. **Abonos.** Se pagan cuando se puede, **sin plazo**, en uno o varios abonos. Un abono puede ir a una compra concreta o al proveedor en general: en ese caso paga primero las compras más antiguas. **Un abono con fecha de hoy sale de la caja abierta** (sin caja, 409 `cash_session_closed`); uno con fecha anterior no toca la caja. Esto incluye el abono que se entrega al recibir la compra.

**Costo y precio al recibir.**

- El costo de cada producto pasa a ser el **promedio ponderado** entre lo que había y lo que llegó: 5 unidades a $18.000 + 3 a $20.000 → $18.750. Sin existencias, queda el costo de la compra.
- **Si el costo sube, el precio de venta sube los mismos pesos**, redondeado hacia arriba al siguiente múltiplo de $1.000: venta $25.000, costo de $18.000 a $18.750 → $25.750 → **$26.000**. Cada cambio queda en el historial de precios.
- **Si el costo baja, el precio no cambia:** bajarlo es decisión del dueño, desde el formulario de producto.

```ts
type PurchaseStatus = "draft" | "received";
type PaymentStatus = "pending" | "partial" | "paid";   // sin abonos, con abonos, pagada
type PaymentMethod = "cash" | "transfer";

interface Supplier {
  id: number;
  name: string;
  tax_id: string;                  // NIT o cédula; puede ir vacío
  phone: string;
  notes: string;
  is_active: boolean;
  balance_due: number;             // lo que se le debe en total (compras recibidas)
}

interface SupplierInput {
  name: string;
  tax_id?: string;
  phone?: string;
  notes?: string;
  is_active?: boolean;
}

interface Purchase {
  id: number;
  supplier: { id: number; name: string };
  document_number: string;         // factura o remisión del proveedor; puede ir vacío
  status: PurchaseStatus;
  status_label: string;            // "Borrador" o "Recibida"
  total: number;                   // en borrador: suma de las líneas
  paid_amount: number;
  balance_due: number;             // total - paid_amount; 0 en borrador
  payment_status: PaymentStatus | null;   // null en borrador
  items_count: number;
  created_by: string;              // username
  created_at: string;
  received_by: string | null;
  received_at: string | null;
}

interface PurchaseItem {
  id: number;
  product: { id: number; code: string; name: string };
  quantity: number;
  unit_cost: number;               // costo por unidad que cobró el proveedor
  subtotal: number;
}

interface PurchaseDetail extends Purchase {
  notes: string;
  items: PurchaseItem[];
  allocations: {                   // abonos aplicados a esta compra
    payment: number;               // id del abono
    paid_on: string;               // "2026-11-01"
    method: PaymentMethod;
    method_label: string;          // "Efectivo" o "Transferencia"
    amount: number;                // parte del abono aplicada a esta compra
  }[];
}

interface PurchaseInput {
  supplier: number;
  document_number?: string;
  notes?: string;
  items?: { product: number; quantity: number; unit_cost: number }[];
}

interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  paid_on?: string;                // "AAAA-MM-DD"; por defecto hoy
  notes?: string;
}

interface ReceivePurchaseInput {
  payment?: PaymentInput | null;   // abono entregado con la mercancía
}

interface PriceChange {
  product: { id: number; code: string; name: string };
  old_price: number;
  new_price: number;
}

type ReceivedPurchase = PurchaseDetail & { price_changes: PriceChange[] };

interface SupplierPayment {
  id: number;
  supplier: { id: number; name: string };
  amount: number;
  method: PaymentMethod;
  method_label: string;
  paid_on: string;
  notes: string;
  allocations: { purchase: number; document_number: string; amount: number }[];
  created_by: string;
  created_at: string;
}

type SupplierPaymentInput = PaymentInput & {
  supplier: number;
  purchase?: number | null;        // vacío: paga primero las compras más antiguas
};
```

**Proveedores.** `GET /suppliers` responde un arreglo de `Supplier` activos, sin paginar y ordenado por nombre. `POST /suppliers` responde el creado (201) y `PATCH /suppliers/{id}` el actualizado. No hay `DELETE`: se desactivan con `is_active: false`. Un proveedor desactivado no se puede elegir en compras nuevas, pero se le pueden seguir registrando abonos.

| Filtro | Ejemplo | Resultado |
| --- | --- | --- |
| `q` | `?q=andina` | El nombre contiene el texto, sin tildes, o el NIT contiene el texto |
| `with_debt` | `?with_debt=true` | Solo los proveedores a los que se les debe |
| `include_inactive` | `?include_inactive=true` | Incluye los desactivados |

| Campo | Reglas |
| --- | --- |
| `name` | Obligatorio; máximo 80; único sin importar mayúsculas |
| `tax_id`, `phone` | Opcionales; máximo 30 |
| `notes` | Opcional; máximo 200 |

Error en `fields`: `name` con "Ya existe un proveedor con ese nombre."

**Lista de compras.** `GET /purchases` responde `Paginated<Purchase>`, de la más reciente a la más antigua.

| Filtro | Ejemplo | Resultado |
| --- | --- | --- |
| `supplier` | `?supplier=3` | Solo las de ese proveedor |
| `status` | `?status=draft` | `draft` o `received` |
| `payment_status` | `?payment_status=pending,partial` | Uno o varios separados por comas. Solo compras recibidas |
| `date_from`, `date_to` | `?date_from=2026-11-01` | Por día de creación, ambos incluidos, en hora de Colombia |

`GET /purchases/{id}` responde `PurchaseDetail`.

**Estado de cuenta de un proveedor.** No tiene una ruta propia: se arma con tres consultas.

- `GET /suppliers/{id}` → `balance_due`, lo que se le debe en total.
- `GET /purchases?supplier={id}&payment_status=pending,partial` → las compras con saldo.
- `GET /supplier-payments?supplier={id}` → los abonos hechos.

**Borrador.** `POST /purchases` crea el borrador y responde `PurchaseDetail` (201). `PATCH /purchases/{id}` lo edita y responde `PurchaseDetail`. **Las líneas enviadas en `items` reemplazan todas las anteriores**; sin `items`, se conservan. `DELETE /purchases/{id}` borra el borrador (204). No hay `PUT`.

```json
{
  "supplier": 3,
  "document_number": "FV-1020",
  "items": [
    { "product": 7, "quantity": 3, "unit_cost": 20000 },
    { "product": 12, "quantity": 10, "unit_cost": 9500 }
  ]
}
```

| Campo | Reglas |
| --- | --- |
| `supplier` | Obligatorio; un proveedor activo |
| `document_number` | Opcional; máximo 40. No se repite para el mismo proveedor, sin importar mayúsculas |
| `notes` | Opcional; máximo 200 |
| `items[].product` | Un producto activo; **una sola línea por producto** |
| `items[].quantity` | Entero mayor que 0 |
| `items[].unit_cost` | Entero mayor o igual a 0; 0 si el proveedor regala las unidades. Se sugiere precargar el `cost_price` del producto |

Un borrador puede guardarse sin productos, pero no se puede recibir así.

Errores en `fields`:

- `document_number`: "Ya hay una compra de este proveedor con ese documento."
- `items`: "FRE-PUL-PAS está repetido: deja una sola línea con la cantidad total.", o un producto inexistente o desactivado.
- `supplier`: el id no existe o el proveedor está desactivado.

**Recibir.** `POST /purchases/{id}/receive` responde `ReceivedPurchase` (200). El cuerpo puede ir vacío (`{}`) si no se abona nada.

```json
{ "payment": { "amount": 50000, "method": "cash" } }
```

```json
{
  "id": 15,
  "status": "received",
  "total": 155000,
  "paid_amount": 50000,
  "balance_due": 105000,
  "payment_status": "partial",
  "price_changes": [
    { "product": { "id": 7, "code": "FRE-PUL-PAS", "name": "Pastillas de freno Pulsar 180" }, "old_price": 25000, "new_price": 26000 }
  ]
}
```

La respuesta trae también los demás campos de `PurchaseDetail`. Si `price_changes` no está vacío, **mostrar al dueño qué precios subieron**: «Pastillas de freno Pulsar 180: $25.000 → $26.000».

Recepción, entradas de inventario, precios y abono se guardan **juntos**: si el abono no es válido, la compra sigue en borrador y no entra nada. Pedir confirmación antes de recibir y deshabilitar el botón mientras responde. Si llega un segundo intento, responde 409 sin repetir las entradas.

Errores:

- 400, `fields.non_field_errors`: "La compra no tiene productos."
- 400, `fields.payment.amount`: "Se deben $155.000: no se pueden abonar $160.000."
- 400, `fields.payment.paid_on`: "La fecha de pago no puede ser futura."
- 409 `purchase_received`: la compra ya se recibió.

**Compra recibida.** `PATCH`, `DELETE` o `receive` sobre una compra recibida responden 409:

```json
{ "code": "purchase_received", "message": "La compra ya se recibió: no se puede modificar.", "fields": {} }
```

**Abonos.** `POST /supplier-payments` responde el `SupplierPayment` creado (201), con el reparto entre compras en `allocations`. Los abonos **no se editan ni se borran**.

```json
{ "supplier": 3, "amount": 45000, "method": "transfer", "notes": "Nequi" }
```

Con compras de $30.000 y $50.000 pendientes, ese abono salda la primera y deja $15.000 abonados a la segunda:

```json
{
  "id": 9,
  "supplier": { "id": 3, "name": "Distribuidora Andina" },
  "amount": 45000,
  "method": "transfer",
  "method_label": "Transferencia",
  "paid_on": "2026-11-01",
  "notes": "Nequi",
  "allocations": [
    { "purchase": 12, "document_number": "FV-1001", "amount": 30000 },
    { "purchase": 15, "document_number": "FV-1020", "amount": 15000 }
  ],
  "created_by": "dueno",
  "created_at": "2026-11-01T15:20:00-05:00"
}
```

| Campo | Reglas |
| --- | --- |
| `supplier` | Obligatorio |
| `purchase` | Opcional; una compra recibida de ese proveedor. Todo el abono se aplica a ella |
| `amount` | Obligatorio; entero mayor que 0. No puede superar lo que se debe: al proveedor en total o a la compra elegida |
| `method` | `cash` o `transfer` |
| `paid_on` | Opcional; día en que se pagó, por defecto hoy. No puede ser futura |
| `notes` | Opcional; máximo 200 |

Errores en `fields`:

- `amount`: "Se deben $30.000: no se pueden abonar $30.001." o "No hay saldo pendiente: no se puede abonar."
- `purchase`: "La compra es de otro proveedor." o "La compra todavía es borrador: recíbela antes de abonar."
- `paid_on`: "La fecha de pago no puede ser futura."

`GET /supplier-payments` responde `Paginated<SupplierPayment>`, del pago más reciente al más antiguo. Filtros: `?supplier=`, `?date_from=` y `?date_to=` (por `paid_on`, ambos incluidos).

### Taller: tipos de servicio y mecánicos

Los servicios del taller **se cobran como líneas de la venta** (ver [Clientes y ventas](#clientes-y-ventas)): no hay orden de trabajo, presupuesto ni estados. Cuando el trabajo está hecho, se agrega el servicio a la venta con su mecánico y el valor acordado, y los repuestos usados como productos de la misma venta.

**Todos consultan; solo el dueño crea y edita.** No se borran (`DELETE` responde 405): se desactivan con `is_active: false`. Los listados no están paginados y muestran solo lo activo, salvo `?include_inactive=true`.

**Tipos de servicio.** `/service-types`, ordenados por código. El código es un número corto para el buscador de la venta: **si lo escrito son solo números, buscar el servicio con ese código** en la lista de `/service-types`, que la ventana puede cargar una vez y guardar. `/catalog/search` sigue devolviendo solo productos.

`POST /service-types`

```json
{ "code": 101, "name": "Cambio de aceite", "suggested_price": 15000 }
```

```json
{ "id": 1, "code": 101, "name": "Cambio de aceite", "suggested_price": 15000, "is_active": true }
```

| Campo | Reglas |
| --- | --- |
| `code` | Obligatorio; entero de 1 a 99999; único |
| `name` | Obligatorio; máximo 80; único sin distinguir mayúsculas; se limpian los espacios |
| `suggested_price` | Obligatorio; pesos enteros, mayor o igual a 0. Es la mano de obra que se propone en la venta |
| `is_active` | Opcional |

Errores: `fields.code` con "Ya existe un tipo de servicio con ese código."; `fields.name` con "Ya existe un tipo de servicio con ese nombre.".

**Mecánicos.** `/mechanics`. El mecánico es un registro de empleado: **no inicia sesión** en el programa. Todos lo consultan para elegirlo en la venta, pero **el vendedor no recibe los porcentajes** (`labor_percentage` ni `effective_percentage`).

`POST /mechanics`

```json
{ "name": "Carlos Ruiz", "phone": "3001112233", "labor_percentage": 70 }
```

```json
{ "id": 1, "name": "Carlos Ruiz", "phone": "3001112233", "labor_percentage": 70, "effective_percentage": 70, "is_active": true }
```

| Campo | Reglas |
| --- | --- |
| `name` | Obligatorio; máximo 80; único sin distinguir mayúsculas |
| `phone` | Opcional; máximo 30 |
| `labor_percentage` | Opcional; de 0 a 100, o `null` para usar el porcentaje general (`default_mechanic_percentage` de [Datos del negocio](#datos-del-negocio)) |
| `effective_percentage` | Solo lectura: el porcentaje con que se le liquida hoy, el suyo o el general |
| `is_active` | Opcional |

Errores: `fields.name` con "Ya existe un mecánico con ese nombre."; `fields.labor_percentage` si pasa de 100.

**`DELETE /mechanics/{id}`** (solo el dueño) elimina un mecánico que nunca tuvo servicios, liquidaciones ni descuentos y responde **204**. Si ya tiene historial responde **409** `mechanic_has_history` y solo se puede desactivar.

```ts
interface ServiceType {
  id: number;
  code: number;                    // 101
  name: string;
  suggested_price: number;
  is_active: boolean;
}

type ServiceTypeInput = Omit<ServiceType, "id">;

interface Mechanic {
  id: number;
  name: string;
  phone: string;
  labor_percentage?: number | null;  // solo el dueño; null = usa el general
  effective_percentage?: number;     // solo el dueño
  is_active: boolean;
}

interface MechanicInput {
  name: string;
  phone?: string;
  labor_percentage?: number | null;
  is_active?: boolean;
}
```

### Liquidación diaria de mecánicos

**Solo el dueño.** Al final del día, a cada mecánico se le paga **su porcentaje de la mano de obra** de los servicios que hizo. Los repuestos no entran: son 100 % del local. El porcentaje es el suyo o el general (ver [Taller](#taller-tipos-de-servicio-y-mecánicos)) y queda guardado en la liquidación, así que cambiarlo después no altera lo pagado. El valor se redondea al peso más cercano.

**Flujo de la pantalla:**

1. `GET /mechanic-settlements/daily` muestra, por mecánico, cuántos servicios tiene sin pagar hoy, su mano de obra, el porcentaje y el valor a pagar. Con `?date=AAAA-MM-DD` se ve otro día, por ejemplo si ayer no se liquidó.
2. El botón **Pagar** de cada mecánico envía `POST /mechanic-settlements/daily`. El dinero **sale de la caja abierta de hoy** (movimiento `mechanic_payment`), aunque el día liquidado sea anterior. Deshabilitar el botón mientras responde.
3. La respuesta trae los servicios pagados, para imprimir la hoja del mecánico.

**Cada servicio se paga una sola vez.** Si después de pagarle se registran más servicios ese día, el mecánico vuelve a aparecer en la vista previa solo con los nuevos, y se le paga aparte: puede haber más de una liquidación por mecánico y día. Los servicios de ventas anuladas no cuentan. **Una venta con servicios ya pagados no se puede anular** (409 `sale_has_settled_services`): se corrige con una [devolución](#devoluciones).

**Descuentos por mal servicio.** Si el mecánico tiene saldo por descontar (ver [Devoluciones](#devoluciones)), se resta de su parte, los más antiguos primero, y `amount` ya viene neto: `amount = share - deductions_total`. Si el descuento es mayor que su parte, `amount` es 0, no sale dinero de la caja y el saldo pasa a la siguiente liquidación. La hoja impresa debe mostrar `deductions` con el servicio, el cliente, el valor y el motivo.

La vista previa solo lista mecánicos con servicios sin pagar ese día, así que un saldo pendiente de alguien sin servicios no aparece allí: se consulta en `GET /mechanic-deductions`.

`GET /mechanic-settlements/daily?date=2026-11-03`

```json
{
  "date": "2026-11-03",
  "mechanics": [
    {
      "mechanic": { "id": 1, "name": "Carlos Ruiz" },
      "services_count": 2, "labor_total": 30000, "percentage": 60,
      "share": 18000, "deductions_total": 0, "amount": 18000,
      "services": [
        {
          "id": 9, "sale_id": 41, "sale_number": 41, "customer": "Ana Gómez",
          "service_type": { "id": 1, "code": 101, "name": "Cambio de aceite" },
          "details": "", "labor_price": 15000
        }
      ]
    },
    {
      "mechanic": { "id": 2, "name": "Pedro Gómez" },
      "services_count": 1, "labor_total": 15000, "percentage": 50,
      "share": 7500, "deductions_total": 0, "amount": 7500,
      "services": [
        {
          "id": 10, "sale_id": 43, "sale_number": 43, "customer": "Juan Pérez",
          "service_type": { "id": 1, "code": 101, "name": "Cambio de aceite" },
          "details": "", "labor_price": 15000
        }
      ]
    }
  ],
  "total": 25500
}
```

`mechanics` llega vacío cuando no hay nada pendiente. Una fecha inválida responde 400 con `fields.date`.

`POST /mechanic-settlements/daily` responde **201** con `MechanicSettlementDetail`.

```json
{ "mechanic": 1 }
```

| Campo | Reglas |
| --- | --- |
| `mechanic` | Obligatorio; id del mecánico. Uno desactivado también se puede liquidar |
| `date` | Opcional, `AAAA-MM-DD`; por defecto hoy. No puede ser futura |
| `method` | Opcional, `cash` o `transfer`; por defecto `cash` |

```json
{
  "id": 7,
  "mechanic": { "id": 1, "name": "Carlos Ruiz" },
  "date": "2026-11-03",
  "labor_total": 30000,
  "percentage": 60,
  "deductions_total": 0,
  "amount": 18000,
  "method": "cash",
  "method_label": "Efectivo",
  "services_count": 2,
  "created_by": "dueno",
  "created_at": "2026-11-03T18:05:00-05:00",
  "services": [
    {
      "id": 9, "sale_id": 41, "sale_number": 41, "customer": "Ana Gómez",
      "service_type": { "id": 1, "code": 101, "name": "Cambio de aceite" },
      "details": "", "labor_price": 15000
    },
    {
      "id": 10, "sale_id": 43, "sale_number": 43, "customer": "Juan Pérez",
      "service_type": { "id": 1, "code": 101, "name": "Cambio de aceite" },
      "details": "", "labor_price": 15000
    }
  ],
  "deductions": []
}
```

Errores: `fields.date` con "No se puede liquidar un día que no ha llegado."; `fields.mechanic` si el id no existe; 409 `nothing_to_settle` si no tiene servicios sin pagar ese día; 409 `cash_session_closed` si no hay caja abierta.

**Historial.** `GET /mechanic-settlements` responde `Paginated<MechanicSettlement>` (sin `services`), de la más reciente a la más antigua, con filtros `?mechanic=`, `?date_from=` y `?date_to=` (día liquidado, ambos incluidos). `GET /mechanic-settlements/{id}` responde `MechanicSettlementDetail`, para reimprimir.

**Saldos por descontar.** `GET /mechanic-deductions` responde `Paginated<MechanicDeduction>`, los más antiguos primero, con filtros `?mechanic=` y `?pending=true` (solo los que aún tienen saldo).

```ts
interface SettlementPreviewRow {
  mechanic: { id: number; name: string };
  services_count: number;
  labor_total: number;             // mano de obra sin pagar del día
  percentage: number;              // porcentaje vigente del mecánico
  share: number;                   // su parte, antes de descuentos
  deductions_total: number;        // lo que se le descontaría en este pago
  amount: number;                  // lo que se le pagaría: share - deductions_total
  services: SettledService[];      // servicios pendientes que se liquidarían
}

interface DailySettlement {
  date: string;                    // AAAA-MM-DD
  mechanics: SettlementPreviewRow[];
  total: number;                   // suma de amount: lo que saldría de la caja
}

interface SettleInput {
  mechanic: number;
  date?: string;                   // por defecto hoy
  method?: PaymentMethod;          // por defecto "cash"
}

interface MechanicSettlement {
  id: number;
  mechanic: { id: number; name: string };
  date: string;                    // día liquidado
  labor_total: number;
  percentage: number;              // el aplicado en ese pago
  deductions_total: number;        // lo descontado en ese pago; su parte era amount + deductions_total
  amount: number;                  // lo pagado
  method: PaymentMethod;
  method_label: string;
  services_count: number;
  created_by: string;              // username de quien pagó
  created_at: string;
}

interface SettledService {
  id: number;
  sale_id: number;
  sale_number: number;
  customer: string;                // vacío si la venta no tiene cliente
  service_type: { id: number; code: number; name: string };
  details: string;
  labor_price: number;
}

interface DeductedService {
  service_type: { id: number; code: number; name: string };
  details: string;
  labor_price: number;
}

interface AppliedDeduction {
  amount: number;                  // lo descontado en esta liquidación
  deduction_total: number;         // el valor completo del descuento
  pending_amount: number;          // lo que falta por descontar HOY (al reimprimir puede ser menor que entonces)
  sale_return_number: number;
  sale_number: number;
  customer: string;                // vacío si la venta no tiene cliente
  reason: string;
  services: DeductedService[];
}

interface MechanicSettlementDetail extends MechanicSettlement {
  services: SettledService[];
  deductions: AppliedDeduction[];
}

interface MechanicDeduction {
  id: number;
  mechanic: { id: number; name: string };
  amount: number;                  // valor completo: mano de obra devuelta + repuestos que no vuelven
  applied_amount: number;          // ya descontado en liquidaciones
  pending_amount: number;          // falta por descontar
  sale_return: number;             // id de la devolución
  sale_return_number: number;
  sale_number: number;
  customer: string;                // vacío si la venta no tiene cliente
  reason: string;
  services: DeductedService[];
  created_at: string;
}
```

### Clientes y ventas

Cualquier usuario con sesión vende y crea clientes. **Las ventas se pagan completas al venderlas: no hay ventas a crédito.** Para vender debe haber **caja abierta** (ver [Caja](#caja)) y el inventario inicial debe estar terminado.

**Flujo de la pantalla de venta:**

1. El carrito vive en la ventana: el backend no guarda borradores.
2. Al cobrar, la ventana genera un `idempotency_key` con `crypto.randomUUID()` y envía `POST /sales` con productos, pagos y, si lo dan, el cliente. **Si la petición se repite con la misma clave (doble clic, reintento por red), el backend devuelve la misma venta con 200 y no descuenta nada otra vez.** Generar una clave nueva solo para una venta nueva.
3. Los pagos van uno por medio y deben **sumar exactamente el total**. El vuelto lo calcula la ventana: si el cliente entrega $50.000 en efectivo para una venta de $43.000, se envía `{"method": "cash", "amount": 43000}`.
4. El precio de cada línea es el del catálogo. **Solo el dueño** puede enviar `unit_price` distinto; la línea queda con `price_changed: true`.
5. Los **servicios del taller** van en `services`, cada uno con su tipo y su mecánico (obligatorio). La mano de obra es el `suggested_price` del tipo; **solo el dueño** puede enviar `labor_price` distinto. Los repuestos usados van en `items` como cualquier producto: se descuentan una sola vez y no entran en el porcentaje del mecánico. Una venta puede tener varios servicios, con mecánicos distintos, y puede ser solo de servicios.
6. La respuesta trae todo lo que va en el recibo.

**El cliente es opcional.** Se envía `customer` (id de uno existente), `new_customer` (se crea con la venta) o ninguno, nunca los dos. Sin cliente, las respuestas traen `customer: null`. Al escribir el nombre, sugerir clientes con `GET /customers?q=texto&page_size=8`. El nombre **puede repetirse** (hay varios "Juan Pérez"); por eso la sugerencia muestra también el teléfono.

**Anular.** Un error se corrige anulando la venta: `POST /sales/{id}/void` con su motivo, **solo el dueño** y con caja abierta. La venta no se borra: queda marcada como anulada, las unidades vuelven al inventario (movimiento `return`) y cada pago se reembolsa por el mismo medio desde la caja abierta de hoy, aunque la venta sea de otro día. Los servicios de una venta anulada quedan en su historial. Una venta que ya tiene devoluciones no se puede anular.

```ts
interface Customer {
  id: number;
  name: string;
  phone: string;                   // puede ir vacío
  notes: string;
  is_active: boolean;
}

interface CustomerInput {
  name: string;                    // obligatorio, máximo 80
  phone?: string;
  notes?: string;
  is_active?: boolean;
}

interface Sale {
  id: number;
  number: number;                  // consecutivo del recibo: 1, 2, 3...
  customer: { id: number; name: string; phone: string } | null;   // null: la venta no tiene cliente
  total: number;                   // productos + mano de obra
  items_count: number;
  services_count: number;
  is_voided: boolean;
  created_by: string;              // username de quien vendió
  created_at: string;
}

interface SaleItem {
  id: number;
  product: { id: number; code: string; name: string };
  description: string;             // "FRE-PUL-PAS · Pastillas de freno Pulsar 180", como quedó en el recibo
  quantity: number;
  returned_quantity: number;       // unidades ya devueltas; se pueden devolver quantity - returned_quantity
  list_price: number;              // precio del catálogo al vender
  unit_price: number;              // precio cobrado
  price_changed: boolean;          // el dueño cambió el precio en esta venta
  subtotal: number;
  unit_cost?: number;              // solo el dueño
}

interface SaleService {
  id: number;
  service_type: { id: number; code: number; name: string };
  mechanic: { id: number; name: string };
  details: string;                 // qué se hizo; opcional, puede ir vacío
  suggested_price: number;         // precio del tipo de servicio al vender
  labor_price: number;             // mano de obra cobrada
  price_changed: boolean;          // el dueño cambió el valor
  is_returned: boolean;            // ya se devolvió: un servicio se devuelve una sola vez
}

interface SaleDetail extends Sale {
  notes: string;
  items: SaleItem[];
  services: SaleService[];
  payments: { method: PaymentMethod; method_label: string; amount: number }[];
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string;
}

interface SaleInput {
  idempotency_key: string;         // UUID generado por la ventana para esta venta
  customer?: number | null;        // cliente existente...
  new_customer?: { name: string; phone?: string } | null;   // ...o uno nuevo
  items?: { product: number; quantity: number; unit_price?: number }[];
  services?: {
    service_type: number;
    mechanic: number;
    details?: string;
    labor_price?: number;          // solo el dueño
  }[];
  payments: { method: PaymentMethod; amount: number }[];
  notes?: string;
}
```

**`POST /sales`** responde **201** con `SaleDetail` si la venta es nueva y **200** con la venta ya hecha si la clave se repite.

```json
{
  "idempotency_key": "6f1c2a7e-3b0d-4b8e-9b51-0c9a3f1d2e4b",
  "new_customer": { "name": "Ana Gómez", "phone": "3001234567" },
  "items": [
    { "product": 12, "quantity": 2 },
    { "product": 30, "quantity": 1 }
  ],
  "payments": [
    { "method": "cash", "amount": 40000 },
    { "method": "transfer", "amount": 24000 }
  ]
}
```

```json
{
  "id": 41,
  "number": 41,
  "customer": { "id": 18, "name": "Ana Gómez", "phone": "3001234567" },
  "total": 64000,
  "items_count": 2,
  "is_voided": false,
  "created_by": "ana",
  "created_at": "2026-11-03T10:15:00-05:00",
  "notes": "",
  "items": [
    {
      "id": 77, "product": { "id": 12, "code": "FRE-PUL-PAS", "name": "Pastillas de freno Pulsar 180" },
      "description": "FRE-PUL-PAS · Pastillas de freno Pulsar 180", "quantity": 2, "returned_quantity": 0,
      "list_price": 25000, "unit_price": 25000, "price_changed": false, "subtotal": 50000
    },
    {
      "id": 78, "product": { "id": 30, "code": "ELE-UNI-BUJ", "name": "Bujía NGK" },
      "description": "ELE-UNI-BUJ · Bujía NGK", "quantity": 1, "returned_quantity": 0,
      "list_price": 14000, "unit_price": 14000, "price_changed": false, "subtotal": 14000
    }
  ],
  "services": [],
  "payments": [
    { "method": "cash", "method_label": "Efectivo", "amount": 40000 },
    { "method": "transfer", "method_label": "Transferencia", "amount": 24000 }
  ],
  "voided_at": null,
  "voided_by": null,
  "void_reason": ""
}
```

Venta de un servicio con su repuesto:

```json
{
  "idempotency_key": "0b6e9f5c-1d2a-4c3b-8e7f-9a0b1c2d3e4f",
  "customer": 18,
  "items": [{ "product": 12, "quantity": 1 }],
  "services": [{ "service_type": 1, "mechanic": 1 }],
  "payments": [{ "method": "cash", "amount": 40000 }]
}
```

La respuesta trae, además de `items`:

```json
"services": [
  {
    "id": 9, "service_type": { "id": 1, "code": 101, "name": "Cambio de aceite" },
    "mechanic": { "id": 1, "name": "Carlos Ruiz" }, "details": "",
    "suggested_price": 15000, "labor_price": 15000, "price_changed": false, "is_returned": false
  }
]
```

| Campo | Reglas |
| --- | --- |
| `idempotency_key` | Obligatorio; UUID |
| `customer` / `new_customer` | Opcionales; como máximo uno de los dos. `customer` debe estar activo. `new_customer` necesita `name`: el teléfono solo no se guarda |
| `items` | Opcional; productos activos, sin repetir; `quantity` entero mayor que 0. La venta necesita al menos un producto o un servicio |
| `items[].unit_price` | Opcional; solo el dueño puede enviarlo distinto del catálogo |
| `services` | Opcional; `service_type` y `mechanic` activos. Se puede repetir el mismo tipo (dos cambios de aceite) |
| `services[].details` | Opcional, máximo 120 |
| `services[].labor_price` | Opcional; solo el dueño puede enviarlo distinto del `suggested_price` |
| `payments` | Un registro por medio, sin repetir medio; `amount` mayor que 0; la suma debe ser igual al total. Una venta de $0 (regalo del dueño) va con `payments: []` |
| `notes` | Opcional; máximo 200 |

Errores en `fields` (los de una línea llegan anidados: `items.1.quantity`):

- `customer`: "Envía un cliente existente o uno nuevo, no los dos."
- `new_customer.name`: "Escribe el nombre del cliente: el teléfono solo no se puede guardar."
- `items`: "Agrega al menos un producto o un servicio."
- `items.N.product`: "FRE-PUL-PAS está repetido: deja una sola línea con la cantidad total."
- `items.N.quantity`: "Solo hay 2 unidades de ELE-UNI-BUJ." o "No hay unidades de ELE-UNI-BUJ."
- `items.N.unit_price`: "Solo el dueño puede cambiar el precio." o "El precio de FRE-PUL-PAS ahora es $26.000." (cambió mientras se armaba la venta: refrescar el producto)
- `services.N.labor_price`: "Solo el dueño puede cambiar el valor del servicio." o "El valor sugerido de «Cambio de aceite» ahora es $18.000."
- `services.N.mechanic` o `services.N.service_type`: el id no existe o está desactivado
- `payments`: "La venta es de $64.000 y el pago suma $60.000: deben ser iguales." o "Cada medio de pago va una sola vez: suma los valores."

Conflictos: 409 `cash_session_closed` (no hay caja abierta) y 409 `initial_count_open` (el inventario inicial sigue abierto).

**`GET /sales`** responde `Paginated<Sale>`, de la más reciente a la más antigua. Filtros: `?number=`, `?customer=`, `?mechanic=` (ventas con algún servicio de ese mecánico), `?voided=true|false`, `?date_from=` y `?date_to=` (día de la venta, ambos incluidos). **`GET /sales/{id}`** responde `SaleDetail`, para ver o reimprimir el recibo.

**`GET /sales/summary`** (solo el dueño) responde `SaleSummary` con las ventas netas del rango `?date_from=` y `?date_to=` (AAAA-MM-DD, ambos incluidos; por defecto el día actual en Colombia). Excluye ventas anuladas, descuenta unidades devueltas en productos y excluye servicios devueltos.

```ts
export interface SaleSummary {
  date_from: string
  date_to: string
  totals: {
    products_quantity: number
    products_total: number
    services_count: number
    services_total: number
    grand_total: number
  }
  categories: { id: number; name: string; quantity: number; total: number }[]
  services: { id: number; name: string; count: number; total: number }[]
  products: {
    id: number
    code: string
    name: string
    category_id: number
    category_name: string
    quantity: number
    total: number
  }[]
}
```

**`POST /sales/{id}/void`** (solo el dueño) recibe `{ "reason": "Se cobró al cliente equivocado" }` y responde `SaleDetail` anulada. Errores: `fields.reason` "Indica por qué se anula la venta.", 409 `sale_voided` si ya estaba anulada, 409 `sale_has_settled_services` si alguno de sus servicios ya se le pagó al mecánico, 409 `sale_has_returns` si ya tiene devoluciones y 409 `cash_session_closed`.

**`/customers`**: `GET` paginado (`?q=` busca todas las palabras en el nombre sin tildes, o en el teléfono; `?include_inactive=true`), `POST`, `GET /customers/{id}` y `PATCH /customers/{id}`. No se borran: se desactivan.

### Devoluciones

Devuelve parte o toda una venta sin tocar el documento original: queda su propio documento, con número consecutivo aparte, que no se edita ni se borra. Cualquier usuario con sesión la registra, salvo la causa **mal servicio**, que es **solo del dueño**. Necesita **caja abierta**: el reembolso sale de la caja de hoy, aunque la venta sea de otro día.

**Qué se devuelve:**

- **Productos:** por unidades, hasta `quantity - returned_quantity` de cada línea de la venta. Se reembolsan **al precio cobrado**, no al del catálogo de hoy. Cada línea indica su estado: `resellable` vuelve al inventario (movimiento `return`) y `damaged` queda anotado pero no entra a las existencias.
- **Servicios:** completos y una sola vez (`is_returned`).

**Causa (`cause`):**

| Valor | Quién | Efecto |
| --- | --- | --- |
| `other` | Cualquiera | El local asume la devolución; el mecánico conserva su parte |
| `bad_service` | Solo el dueño | Debe incluir servicios de **un solo mecánico**. Se le descuenta la mano de obra devuelta completa más los repuestos `damaged`, al precio cobrado. Los `resellable` no se le descuentan |

El descuento se aplica en sus próximas liquidaciones (ver [Liquidación](#liquidación-diaria-de-mecánicos)), también si el servicio ya se le había pagado.

**Reembolso (`refunds`):** uno por medio y debe **sumar exactamente el total devuelto**. Puede repartirse entre efectivo y transferencia, y no tiene que coincidir con el medio en que se pagó la venta.

**Reintentos:** como en la venta, la ventana genera un `idempotency_key` con `crypto.randomUUID()`. Si se repite, responde 200 con la devolución ya hecha y no reembolsa otra vez. Para evitar errores, calcular el total en la ventana y deshabilitar el botón mientras responde.

**`POST /sales/{id}/returns`** responde **201** con `SaleReturnDetail` si es nueva y **200** si la clave se repite.

```json
{
  "idempotency_key": "2f7d1c9a-8e44-4c1b-a6f0-5d3b7e9c1a20",
  "cause": "bad_service",
  "reason": "Quedó botando aceite",
  "items": [{ "sale_item": 77, "quantity": 1, "condition": "damaged" }],
  "services": [9],
  "refunds": [{ "method": "cash", "amount": 40000 }]
}
```

```json
{
  "id": 3,
  "number": 3,
  "sale": 41,
  "sale_number": 41,
  "customer": { "id": 18, "name": "Ana Gómez", "phone": "3001234567" },
  "cause": "bad_service",
  "cause_label": "Mal servicio del mecánico",
  "reason": "Quedó botando aceite",
  "total": 40000,
  "created_by": "dueno",
  "created_at": "2026-11-05T16:20:00-05:00",
  "items": [
    {
      "id": 5, "sale_item": 77, "product": { "id": 12, "code": "FRE-PUL-PAS", "name": "Pastillas de freno Pulsar 180" },
      "description": "FRE-PUL-PAS · Pastillas de freno Pulsar 180", "quantity": 1,
      "condition": "damaged", "condition_label": "No puede volver", "unit_price": 25000, "subtotal": 25000
    }
  ],
  "services": [
    {
      "id": 2, "sale_service": 9, "service_type": { "id": 1, "code": 101, "name": "Cambio de aceite" },
      "mechanic": { "id": 1, "name": "Carlos Ruiz" }, "details": "", "labor_price": 15000
    }
  ],
  "refunds": [{ "method": "cash", "method_label": "Efectivo", "amount": 40000 }],
  "mechanic_deduction": {
    "mechanic": { "id": 1, "name": "Carlos Ruiz" }, "amount": 40000, "applied_amount": 0, "pending_amount": 40000
  }
}
```

| Campo | Reglas |
| --- | --- |
| `idempotency_key` | Obligatorio; UUID |
| `cause` | Obligatorio; `other` o `bad_service` |
| `reason` | Obligatorio; máximo 150 |
| `items` | Opcional; líneas de esta venta, sin repetir. Debe haber al menos un producto o un servicio |
| `items[].quantity` | Entero mayor que 0, hasta lo que falte por devolver |
| `items[].condition` | Obligatorio; `resellable` o `damaged`. La ventana debe preguntarlo: no tiene valor por omisión |
| `services` | Opcional; ids de `services[].id` de esta venta |
| `refunds` | Un registro por medio; `amount` mayor que 0; la suma debe ser igual al total. Si el total es $0, va `refunds: []` |

Errores en `fields` (los de una línea llegan anidados, como en la venta):

- `cause`: "Solo el dueño puede registrar una devolución por mal servicio."
- `reason`: "Indica el motivo de la devolución."
- `items`: "Indica al menos un producto o un servicio para devolver.", "Este producto no es de esta venta." o "Un producto está repetido en la devolución: cambia su cantidad."
- `items.N.quantity`: "Solo quedan 2 por devolver de FRE-PUL-PAS · Pastillas de freno Pulsar 180." o "Ya se devolvieron todas las unidades de…"
- `services`: "El servicio «Cambio de aceite» ya se devolvió.", "Este servicio no es de esta venta.", "Un servicio está repetido en la devolución." o "Indica los servicios de un solo mecánico."
- `refunds`: "La devolución es de $40.000 y el reembolso suma $30.000: deben ser iguales." o "Cada medio de pago va una sola vez: suma los valores."

Conflictos: 409 `sale_voided` (la venta está anulada) y 409 `cash_session_closed`. Una venta que no existe responde 404.

**`GET /sale-returns`** responde `Paginated<SaleReturn>`, de la más reciente a la más antigua. Filtros: `?sale=`, `?number=`, `?cause=`, `?date_from=` y `?date_to=` (día de la devolución, ambos incluidos). **`GET /sale-returns/{id}`** responde `SaleReturnDetail`.

```ts
type ReturnCause = "bad_service" | "other";
type ReturnCondition = "resellable" | "damaged";

interface SaleReturn {
  id: number;
  number: number;                  // consecutivo, aparte del de las ventas
  sale: number;                    // id de la venta
  sale_number: number;
  customer: { id: number; name: string; phone: string } | null;   // null: la venta no tiene cliente
  cause: ReturnCause;
  cause_label: string;
  reason: string;
  total: number;
  created_by: string;
  created_at: string;
}

interface SaleReturnDetail extends SaleReturn {
  items: {
    id: number;
    sale_item: number;
    product: { id: number; code: string; name: string };
    description: string;
    quantity: number;
    condition: ReturnCondition;
    condition_label: string;
    unit_price: number;            // el cobrado en la venta
    subtotal: number;
  }[];
  services: {
    id: number;
    sale_service: number;
    service_type: { id: number; code: number; name: string };
    mechanic: { id: number; name: string };
    details: string;
    labor_price: number;
  }[];
  refunds: { method: PaymentMethod; method_label: string; amount: number }[];
  mechanic_deduction?: {           // solo el dueño; null si no hay descuento
    mechanic: { id: number; name: string };
    amount: number;
    applied_amount: number;
    pending_amount: number;
  } | null;
}

interface SaleReturnInput {
  idempotency_key: string;
  cause: ReturnCause;
  reason: string;
  items?: { sale_item: number; quantity: number; condition: ReturnCondition }[];
  services?: number[];
  refunds: { method: PaymentMethod; amount: number }[];
}
```

### Caja

La caja es **la jornada de dinero**: se abre con el efectivo que hay en el cajón y se cierra contándolo. **Abrir, cerrar, ver los montos y registrar gastos es solo del dueño.** Mientras no haya caja abierta **no se vende, no se anula, no se devuelve y no se registran abonos ni pagos de hoy**: esas rutas responden 409 `cash_session_closed`.

Lo que entra y sale queda como movimiento de la caja abierta, con signo (positivo entra, negativo sale):

| `kind` | Signo | Lo crea |
| --- | --- | --- |
| `sale` | + | Cada pago de una venta, por su medio |
| `sale_refund` | − | La anulación de una venta o una devolución (esta última trae `sale_return`) |
| `consignee_payment` | + | El pago de un local en consignación |
| `supplier_payment` | − | Un abono a proveedor con fecha de hoy. **Uno con fecha anterior se pagó por fuera y no toca la caja** |
| `expense` | − | Un gasto, registrado a mano con su motivo |
| `owner_withdrawal` | − | Un retiro del dueño, registrado a mano con su motivo |
| `mechanic_payment` | − | El pago de la liquidación de un mecánico |

**El efectivo esperado** es el inicial más los movimientos en efectivo. Las transferencias se suman aparte y no cuentan para el cajón. Al cerrar, si el contado no coincide con el esperado, **la explicación es obligatoria**; la diferencia queda guardada (positiva sobra, negativa falta).

```ts
type CashMovementKind =
  | "sale" | "sale_refund" | "consignee_payment" | "supplier_payment" | "expense" | "owner_withdrawal"
  | "mechanic_payment";

interface CashSummaryRow {
  kind: CashMovementKind;
  kind_label: string;              // "Venta", "Gasto"...
  cash: number;                    // con signo
  transfer: number;                // con signo
}

interface CashSession {
  id: number;
  is_open: boolean;
  opening_cash: number;
  expected_cash: number;           // abierta: el de este momento; cerrada: el del cierre
  counted_cash: number | null;     // null mientras está abierta
  difference: number | null;       // contado - esperado; null mientras está abierta
  closing_notes: string;
  opened_by: string;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  summary: {                       // no viene en el listado
    by_kind: CashSummaryRow[];     // solo los tipos que tuvieron movimientos
    cash_total: number;
    transfer_total: number;
  };
}

interface CurrentCash {
  is_open: boolean;
  session?: CashSession | null;    // solo el dueño
  suggested_opening_cash?: number; // solo el dueño: efectivo contado en el último cierre
}

interface CashMovement {
  id: number;
  session: number;
  kind: CashMovementKind;
  kind_label: string;
  method: PaymentMethod;
  method_label: string;
  amount: number;                  // con signo
  reason: string;                  // "Venta 41 · Ana Gómez", "Almuerzo", "Abono a Distribuidora Andina"
  sale: number | null;
  sale_number: number | null;
  sale_return: number | null;      // id de la devolución, en sus reembolsos
  supplier_payment: number | null;
  consignee_payment: number | null;
  mechanic_settlement: number | null;   // id de la liquidación, en los pagos a mecánicos
  created_by: string;
  created_at: string;
}

interface SpendInput {
  kind: "expense" | "owner_withdrawal";
  amount: number;                  // positivo; el movimiento queda negativo
  method: PaymentMethod;
  reason: string;                  // obligatorio
}
```

| Método y ruta | Acceso | Descripción |
| --- | --- | --- |
| `GET /cash-sessions/current` | Sesión | `CurrentCash`. El vendedor solo recibe `is_open`, para saber si puede vender |
| `POST /cash-sessions` | Dueño | Abre con `{ "opening_cash": 50000 }`. Responde 201 con `CashSession`. Si ya hay una abierta: `non_field_errors` "Ya hay una caja abierta: ciérrala primero." |
| `POST /cash-sessions/{id}/close` | Dueño | Cierra con `{ "counted_cash": 56000, "notes": "Faltó sencillo" }`. Responde `CashSession` cerrada |
| `GET /cash-sessions` | Dueño | Historial paginado, sin `summary`. Filtros `?date_from=` y `?date_to=` (día de apertura) |
| `GET /cash-sessions/{id}` | Dueño | Una caja con su resumen |
| `GET /cash-movements` | Dueño | Paginado. Filtros `?session=`, `?kind=` y `?method=` |
| `POST /cash-movements` | Dueño | Registra un gasto o un retiro (`SpendInput`). Responde 201 con `CashMovement` |

Errores del cierre: `fields.notes` "Faltan $1.000 frente a lo esperado: explica la diferencia." (o "Sobran...") y 409 `cash_session_closed` si ya estaba cerrada. Del gasto: `fields.reason` "Indica en qué se usó el dinero." y 409 `cash_session_closed`.

Ejemplo de `summary` con una venta mixta y un gasto:

```json
{
  "by_kind": [
    { "kind": "sale", "kind_label": "Venta", "cash": 10000, "transfer": 15000 },
    { "kind": "expense", "kind_label": "Gasto", "cash": -3000, "transfer": 0 }
  ],
  "cash_total": 7000,
  "transfer_total": 15000
}
```

### Consignación

El dueño le deja mercancía a **otros locales** para que la vendan. Todo el módulo es **solo del dueño**; el vendedor recibe 403.

**Flujo:**

1. **Entrega.** Se eligen el local y los productos con su cantidad y su **valor pactado** por unidad: lo que el local pagará por cada una que venda. **Por defecto es el costo del producto**, no el precio de venta, y el dueño puede ajustarlo. **Las unidades salen del inventario** de la tienda (movimiento `consignment_out`).
2. **Reporte.** Cada cierto tiempo el local dice cuántas vendió y devuelve las que no. Por cada línea de entrega se envían las `sold` y las `returned`. Lo vendido **se suma al saldo del local al valor pactado de esa entrega**; lo devuelto **vuelve al inventario** (movimiento `consignment_return`). No se puede reportar más de lo que el local todavía tiene.
3. **Pagos.** El local paga **por partes**. Cada pago baja su saldo y entra a la caja abierta.

Para armar un reporte, `GET /consignees/{id}/pending-items` da la lista de lo que el local todavía tiene, con la entrega de donde salió cada línea.

```ts
interface Consignee {
  id: number;
  name: string;                    // único, sin distinguir mayúsculas
  tax_id: string;
  phone: string;
  notes: string;
  is_active: boolean;
  balance_due: number;             // solo lectura: lo vendido reportado menos lo pagado
}

interface ConsignmentItem {
  id: number;                      // se usa como `item` en el reporte
  product: { id: number; code: string; name: string };
  quantity: number;                // entregadas
  unit_value: number;              // valor pactado por unidad
  unit_cost: number;               // costo de la tienda al entregar
  sold_quantity: number;
  returned_quantity: number;
  pending_quantity: number;        // las que el local todavía tiene
}

interface PendingConsignmentItem extends ConsignmentItem {
  delivery: number;
  delivered_at: string;
}

interface ConsignmentDelivery {
  id: number;
  consignee: { id: number; name: string };
  notes: string;
  items: ConsignmentItem[];
  total_value: number;             // entregadas × valor pactado
  created_by: string;
  created_at: string;
}

interface ConsignmentDeliveryInput {
  idempotency_key: string;         // UUID, igual que en las ventas
  consignee: number;
  items: { product: number; quantity: number; unit_value?: number }[];   // sin unit_value: el costo
  notes?: string;
}

interface ConsignmentReport {
  id: number;
  consignee: { id: number; name: string };
  total: number;                   // vendidas × valor pactado: lo que sube el saldo
  notes: string;
  lines: {
    item: number;
    delivery: number;
    product: { id: number; code: string; name: string };
    unit_value: number;
    sold: number;
    returned: number;
    subtotal: number;              // sold × unit_value
  }[];
  created_by: string;
  created_at: string;
}

interface ConsignmentReportInput {
  consignee: number;
  lines: { item: number; sold?: number; returned?: number }[];
  notes?: string;
}

interface ConsigneePayment {
  id: number;
  consignee: { id: number; name: string };
  amount: number;
  method: PaymentMethod;
  method_label: string;
  notes: string;
  created_by: string;
  created_at: string;
}

interface ConsigneePaymentInput {
  consignee: number;
  amount: number;
  method: PaymentMethod;
  notes?: string;
}
```

| Método y ruta | Descripción |
| --- | --- |
| `GET`, `POST /consignees` | Locales (`?q=`, `?with_debt=true`, `?include_inactive=true`; sin paginar) |
| `GET`, `PATCH /consignees/{id}` | Consulta o edita un local; no se borran, se desactivan |
| `GET /consignees/{id}/pending-items` | `PendingConsignmentItem[]`, de la entrega más antigua a la más nueva |
| `GET`, `POST /consignment-deliveries` | Entregas paginadas. `POST` responde 201, o 200 si la clave se repite |
| `GET /consignment-deliveries/{id}` | Una entrega |
| `GET`, `POST /consignment-reports` | Reportes paginados. `POST` responde 201 |
| `GET /consignment-reports/{id}` | Un reporte |
| `GET`, `POST /consignee-payments` | Pagos paginados. `POST` responde 201 |
| `GET /consignee-payments/{id}` | Un pago |

Las listas de entregas, reportes y pagos filtran por `?consignee=`, `?date_from=` y `?date_to=`. Nada de esto se edita ni se borra.

Errores en `fields`:

- Entrega: `items` "Agrega al menos un producto."; `items.N.product` "... está repetido..."; `items.N.quantity` "Solo hay 2 unidades de ELE-UNI-BUJ."; 409 `initial_count_open`.
- Reporte: `lines` "Indica al menos una unidad vendida o devuelta."; `lines.N.item` "Esta línea es de una entrega a otro local." o "... está repetido: deja una sola línea."; `lines.N.sold` "Al local le quedan 3 de FRE-PUL-PAS."
- Pago: `amount` "El local debe $30.000: no se pueden pagar $30.001." o "El local no debe nada: no se puede registrar el pago."; 409 `cash_session_closed`.
- Local: `name` "Ya existe un local con ese nombre."
## Distribución y migraciones del backend local

Desde la integración del instalador, Django también se ejecuta como `backend.exe` empaquetado con PyInstaller. El contrato HTTP y sus credenciales no cambian. Antes de aplicar migraciones pendientes sobre una base existente, el arranque guarda una copia SQLite consistente, `secret_key` y un manifiesto en `data/backups/pre-migration/`. Si falla el respaldo o la migración, no habilita la API; la ventana informa el fallo de arranque. No se añaden endpoints ni tipos TypeScript. Véase [publicación y recuperación](../PUBLICACION.md).
