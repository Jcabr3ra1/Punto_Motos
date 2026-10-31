# API del backend: guía para el frontend

Contrato vigente de la API local de Django. Se actualiza con cada cambio del backend; los cambios se resumen en [CAMBIOS.md](CAMBIOS.md).

Versión del backend: **0.1.0**.

## Conexión

| Dato | Valor |
| --- | --- |
| URL base | `http://127.0.0.1:<puerto>/api/v1` |
| Puerto | Lo elige Tauri al iniciar el sidecar; en desarrollo, `8765` |
| Credencial | Cabecera `X-Punto-Moto-Token` en **todas** las llamadas |
| Formato | JSON (`Content-Type: application/json`) |
| Fechas | ISO 8601 con zona horaria de Colombia, por ejemplo `2026-10-30T18:56:04.523678-05:00` |

Tauri genera la credencial en cada inicio y se la entrega al backend y a la ventana; el mecanismo exacto para pasarla a React se definirá en `desktop/`. La ventana no debe guardarla en `localStorage`.

Orígenes aceptados: `http://tauri.localhost` (ventana de Tauri en Windows), `tauri://localhost` (Linux) y `http://localhost:5173` (Vite). Cualquier otro origen recibe 403.

### Desarrollo sin Tauri

Alex o Juan pueden levantar el backend sin credencial:

```bash
cd backend
PUNTO_MOTO_DEBUG=1 .venv/Scripts/python manage.py runserver 127.0.0.1:8765
```

Sin credencial configurada, el backend no exige la cabecera, así que el frontend puede llamarlo desde Vite (`http://localhost:5173`) directamente.

### Ejemplo de cliente

```ts
const API_BASE = `http://127.0.0.1:${port}/api/v1`;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Punto-Moto-Token": token,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw body as ApiError;
  return body as T;
}
```

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
| 401 | `invalid_app_token` | Falta la credencial o no coincide | Error de la aplicación, no del usuario: pedir reiniciar el programa |
| 403 | `origin_not_allowed` | Llamada desde un origen no permitido | Solo debería verse en desarrollo; revisar el puerto de Vite |
| 404 | `not_found` | Ruta o registro inexistente | Mostrar `message` |
| 405 | `method_not_allowed` | Método no soportado en la ruta | Error de programación |
| 500 | `server_error` | Fallo inesperado del backend | Mostrar `message`; la operación no se completó y se puede reintentar |

## Endpoints

### Estado del backend

`GET /health`

Tauri lo consulta para saber cuándo mostrar las pantallas. El frontend puede usarlo para mostrar la versión.

```json
{ "status": "ok", "version": "0.1.0", "server_time": "2026-10-30T18:56:04.472609-05:00" }
```

```ts
interface Health {
  status: "ok";
  version: string;
  server_time: string;
}
```

### Datos del negocio

Datos que se imprimen en el encabezado del recibo. Hay un solo registro por instalación; la primera vez todos los campos de texto llegan vacíos.

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
