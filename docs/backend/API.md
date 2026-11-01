# API del backend: guía para el frontend

Contrato vigente de la API local de Django. Se actualiza con cada cambio del backend; los cambios se resumen en [CAMBIOS.md](CAMBIOS.md).

Versión del backend: **0.4.0**.

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
| Dueño | `owner` | Todo: administrar usuarios, cambiar datos del negocio y, en los próximos módulos, cambiar precios, ver costos, ajustar inventario, cargar y terminar el inventario inicial y, en los próximos módulos, anular y restaurar |
| Vendedor | `seller` | Consultar y registrar ventas y cobros; no administra usuarios ni cambia datos del negocio |

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
| `GET /catalog/search` | Sesión | Buscador de la pantalla de venta |
| `GET /catalog/code-suggestion` | Dueño | Sugiere un código mientras se llena el formulario |
| `GET /inventory/movements` | Sesión | Movimientos de inventario (kárdex) paginados |
| `POST /inventory/adjustments` | Dueño | Ajuste físico de existencias con motivo |
| `GET /inventory/initial-count` | Sesión | Estado y avance del inventario inicial |
| `POST /inventory/initial-count/items` | Dueño | Crea un producto con su cantidad contada |
| `POST /inventory/initial-count/finish` | Dueño | Termina el inventario inicial |

### Estado del backend

`GET /health`

Tauri lo consulta para saber cuándo mostrar las pantallas. El frontend puede usarlo para mostrar la versión.

```json
{ "status": "ok", "version": "0.4.0", "server_time": "2026-10-30T18:56:04.472609-05:00" }
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
| `updated_at` | fecha | Solo lectura |

Errores: `validation_error` con `fields.name` si el nombre llega vacío, o con el campo que exceda su longitud.

```ts
interface BusinessSettings {
  name: string;
  tax_id: string;
  address: string;
  phone: string;
  receipt_footer: string;
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
| `abbreviation` | De 2 a 4 letras; se acepta en minúsculas y se guarda en mayúsculas. En tipos es única; en motos puede repetirse entre versiones (Pulsar 180 y Pulsar 200 usan `PUL`) y `UNI` está reservada para los universales |
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

Las existencias de cada producto **solo cambian con movimientos**: inventario inicial, compras, ventas, devoluciones y ajustes. Cada movimiento guarda la cantidad con signo (positiva entra, negativa sale), la existencia que quedó, quién lo hizo, la fecha y el motivo. Los movimientos no se editan ni se borran: un error se corrige con otro movimiento. **Las existencias nunca quedan en negativo.**

```ts
type MovementKind = "initial_count" | "purchase" | "sale" | "return" | "adjustment";

interface InventoryMovement {
  id: number;
  product: { id: number; code: string; name: string };
  kind: MovementKind;
  kind_label: string;              // "Inventario inicial", "Compra", "Venta", "Devolución", "Ajuste"
  quantity: number;                // con signo: 5 entra, -2 sale
  unit_cost?: number;              // solo el dueño: costo por unidad en ese momento
  balance_after: number;           // existencia que quedó después del movimiento
  reason: string;                  // vacío salvo en ajustes
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
