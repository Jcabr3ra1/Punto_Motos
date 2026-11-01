# Frontend

Responsable: **Juan**.

Interfaz de la aplicación en React y TypeScript. Se muestra dentro de la ventana de Tauri y consume la API local de Django; nunca accede directamente a la base de datos ni ejecuta SQL. Ver la [sección 7 del informe](../docs/informe_proyecto_taller.md#7-arquitectura-de-escritorio-y-alternativas).

## Contexto del backend

- [docs/backend/API.md](../docs/backend/API.md): endpoints, ejemplos, errores y tipos TypeScript.
- [docs/backend/CAMBIOS.md](../docs/backend/CAMBIOS.md): qué cambió en el backend y qué debe hacer el frontend.

## Tecnologías

- React con TypeScript.
- Cliente HTTP para la API `/api/v1` de Django.
- Respuestas simuladas según el contrato OpenAPI mientras el backend no esté listo.

## Responsabilidades

- Navegación y pantallas: inicio, catálogo e inventario, compras, ventas, servicios de taller, empleados, caja, cierres, reportes, configuración y respaldos.
- Venta rápida de mostrador con búsqueda, navegación con teclado y servicios con tipo, placa y mecánico.
- Pantalla de carga del inventario inicial y plantilla de conteo.
- Diseño del recibo de 80 mm y de la liquidación diaria, junto con la prueba física en la impresora.
- Configuración de respaldos, avisos del último respaldo externo y restauración guiada.
- Estados de carga, error y confirmación, distinguiendo borradores de operaciones confirmadas.

## Reglas de la interfaz

- Mostrar siempre los precios y totales confirmados por Django; el cálculo previo en pantalla es solo orientativo.
- Bloquear el doble clic y los reintentos accidentales en las confirmaciones, reutilizando la misma clave de reintento.
- Mostrar mensajes que expliquen qué se guardó o qué falta corregir, con errores por campo cuando la API los devuelva.
- Ocultar costos, ajustes y acciones según los permisos del usuario.

## Estructura propuesta

```text
frontend/
  src/
    api/          # cliente y tipos generados desde OpenAPI
    pages/        # una carpeta por módulo
    components/   # componentes compartidos
    hooks/
    mocks/        # respuestas simuladas del contrato
  package.json
```

## Entregables

- Pantallas integradas con la API real.
- Pruebas de interacción de los flujos de venta, servicio, devolución y cierres.
- Guía de uso para el dueño y los vendedores.

## Cómo ejecutarlo

Requiere Node 24 o superior.

```bash
cd frontend
npm install
cp .env.example .env.local   # opcional: los valores por defecto sirven en desarrollo
npm run dev                  # http://localhost:5173
```

El backend debe estar corriendo en `127.0.0.1:8765` con `PUNTO_MOTO_DEBUG=1` (ver [backend/README.md](../backend/README.md)). El puerto de Vite es fijo (`5173`) porque es el único origen que el backend acepta en desarrollo.

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas (Vitest + Testing Library) |
| `npm run lint` | Revisión con oxlint |
| `npm run build` | Revisión de tipos y compilación |

## Estado

- **Esqueleto:** Vite, React, TypeScript, pruebas y cliente de la API (`src/api/client.ts`) con manejo de `ApiError`, credencial del programa, token de sesión en memoria y aviso cuando la sesión vence.
- **Acceso:** flujo de arranque (`/health` → `/setup/status`), asistente del primer dueño, inicio y cierre de sesión, y aviso cuando la sesión vence (`src/auth/`, `src/pages/acceso/`). Tras iniciar sesión se muestra una pantalla provisional.
- **Siguiente paso:** menú y estructura de pantallas según el rol (React Router).
