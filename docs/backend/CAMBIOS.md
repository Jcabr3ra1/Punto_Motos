# Bitácora de cambios del backend

Resumen de cada cambio del backend y de lo que implica para el frontend. La entrada más reciente va arriba. El contrato completo está en [API.md](API.md).

Formato de cada entrada:

```text
## AAAA-MM-DD · Título corto (versión)
Qué cambió: ...
Qué debe hacer el frontend: ... (o "Ninguna acción para el frontend")
Cambio incompatible: solo si se renombra o quita algo que el frontend ya usa
```

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
