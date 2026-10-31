# API del backend: guía para el frontend

Contrato vigente de la API local de Django. Se actualiza con cada cambio del backend; los cambios se resumen en [CAMBIOS.md](CAMBIOS.md).

Versión del backend: **0.2.0**.

## Conexión

| Dato | Valor |
| --- | --- |
| URL base | `http://127.0.0.1:<puerto>/api/v1` |
| Puerto | Lo elige Tauri al iniciar el sidecar; en desarrollo, `8765` |
| Credencial del programa | Cabecera `X-Punto-Moto-Token` en **todas** las llamadas |
| Sesión del usuario | Cabecera `Authorization: Token <token>` después de iniciar sesión |
| Formato | JSON (`Content-Type: application/json`) |
| Fechas | ISO 8601 con zona horaria de Colombia, por ejemplo `2026-10-30T18:56:04.523678-05:00` |

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
| Dueño | `owner` | Todo: administrar usuarios, cambiar datos del negocio y, en los próximos módulos, cambiar precios, ver costos, ajustar inventario, anular y restaurar |
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
| 400 | `validation_error` | Datos inválidos | Mostrar cada mensaje de `fields` junto a su campo; `non_field_errors` va arriba del formulario |
| 401 | `not_authenticated` | No se envió el token de sesión | Ir a la pantalla de inicio de sesión |
| 401 | `authentication_failed` | Token de sesión inválido o vencido (cierre de sesión, programa reiniciado, usuario desactivado o contraseña cambiada) | Borrar el token y volver a la pantalla de inicio de sesión |
| 401 | `invalid_app_token` | Falta la credencial del programa o no coincide | Error de la aplicación, no del usuario: pedir reiniciar el programa |
| 403 | `permission_denied` | El rol del usuario no permite la acción | Mostrar `message`; la acción no debió estar visible |
| 403 | `origin_not_allowed` | Llamada desde un origen no permitido | Solo debería verse en desarrollo; revisar el puerto de Vite |
| 404 | `not_found` | Ruta o registro inexistente | Mostrar `message` |
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

### Estado del backend

`GET /health`

Tauri lo consulta para saber cuándo mostrar las pantallas. El frontend puede usarlo para mostrar la versión.

```json
{ "status": "ok", "version": "0.2.0", "server_time": "2026-10-30T18:56:04.472609-05:00" }
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
