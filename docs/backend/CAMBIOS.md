# Bitácora de cambios del backend

Resumen de cada cambio del backend y de lo que implica para el frontend. La entrada más reciente va arriba. El contrato completo está en [API.md](API.md).

Formato de cada entrada:

```text
## AAAA-MM-DD · Título corto (versión)
Qué cambió: ...
Qué debe hacer el frontend: ... (o "Ninguna acción para el frontend")
Cambio incompatible: solo si se renombra o quita algo que el frontend ya usa
```

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
