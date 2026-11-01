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

## Identidad visual

Logo y colores del negocio (`public/logo.png`, `public/favicon.png`). Los tokens están al inicio de `src/index.css`.

| Color | Valor | Uso |
| --- | --- | --- |
| Negro | `#000000` | Menú lateral y pantallas de acceso. Es el fondo del logo, así que se funde con él |
| Lima | `#cde409` | Botones principales (con **texto negro**) y elemento activo del menú. Sobre blanco solo tiene 1,3:1 de contraste: **nunca como color de texto ni de borde sobre fondo claro** |
| Oliva | `#4a5700` | Texto, enlaces y líneas de acento sobre fondo claro (7,9:1 sobre blanco) |
| Plata | `#b1afae` | Texto secundario sobre negro |

El contenido de trabajo se mantiene sobre fondo claro por legibilidad en el mostrador. Los avisos de error, éxito y advertencia conservan sus colores propios.

## Diseño de aplicación de escritorio

La interfaz se ejecuta dentro de una ventana de Tauri en Windows, así que está pensada como aplicación y no como página web:

- **Ventana fija:** el alto es el de la ventana (`100vh`) y la página nunca se desplaza; solo se desplaza el área de contenido. El menú lateral, la barra superior y la barra de estado quedan siempre en su lugar.
- **Barra superior:** nombre del negocio (de «Datos del negocio») y la persona con la sesión abierta, con «Cerrar sesión».
- **Barra de estado:** si hay conexión con el programa (`/health`, cada 30 s) y la versión del backend.
- **Densidad de Windows:** Segoe UI a 14 px, controles de unos 32 px, esquinas de 4 px, sin sombras, tablas compactas y botones del formulario fijos al pie.
- **Comportamiento nativo:** el marco (menú, barras, botones) no se selecciona ni se arrastra, el cursor de los botones es la flecha y no hay rebote de «página» al final del scroll.
- **Tamaño mínimo:** en lugar de apilarse como una web, la aplicación tiene un ancho mínimo (`52rem`, unos 730 px). En `desktop/` conviene configurar la ventana de Tauri con `minWidth` ≈ 900 y `minHeight` ≈ 560.
- **Arrastrar la ventana:** la barra superior ya lleva `data-tauri-drag-region`; sirve si más adelante se quita la barra de título nativa (con botones de ventana propios).

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
- **Acceso:** flujo de arranque (`/health` → `/setup/status`), asistente del primer dueño, inicio y cierre de sesión, y aviso cuando la sesión vence (`src/auth/`, `src/pages/acceso/`).
- **Estructura:** menú lateral según el rol y rutas por hash (`#/productos`) con React Router. `src/navegacion/destinos.ts` es la única lista de pantallas y permisos: de ahí salen el menú, las pestañas de Configuración y las rutas protegidas. Un vendedor que escriba la dirección de una pantalla del dueño ve "No tienes permiso". Cada inicio de sesión parte de Inicio.
- **Datos del negocio:** el dueño edita y guarda (`PUT /settings/business`); el vendedor los ve en solo lectura.
- **Usuarios** (solo el dueño): lista, alta, edición de nombre, rol y estado, y cambio de contraseña. Quien edita su propia cuenta no puede cambiarse el rol ni desactivarse.
- **Consultas:** TanStack Query para pedir y guardar datos (`src/api/consultas.ts`). La caché se vacía al iniciar y cerrar sesión para que nadie vea datos de otro usuario.
- **Tipos, marcas y motos** (solo el dueño): una sola pantalla con tres secciones que comparten lista, alta y edición. Se desactivan en vez de borrarse y siempre se muestran los desactivados.
- **Productos:** lista paginada con búsqueda con pausa corta, filtros por tipo y moto, insumos de taller y orden. Muestra la existencia con la marca «Reponer» (`is_low_stock`) y «Bajo el costo» (`sells_below_cost`). El vendedor no ve la columna de costo. El dueño crea y edita: el código se deja vacío para que se genere solo, con una sugerencia mientras escribe, y se avisa cuando el precio de venta es menor que el costo.
- **Venta** (`#/venta`): por ahora solo consulta precios y existencias con el buscador de `GET /catalog/search` (desde 2 letras, con pausa corta). Los productos con `stock: 0` salen marcados «Sin existencias» y avisa mientras el inventario inicial siga abierto. El componente ya maneja teclado (flechas, Enter, Esc) cuando recibe `onElegir`, pero la pantalla no lo usa: **no hay módulo de ventas en el backend**, y no se construye nada de ventas hasta que exista su contrato en `docs/backend/API.md`.
- **Inventario inicial** (solo el dueño, `#/inventario-inicial`): carga productos nuevos con su «Cantidad contada» reutilizando el formulario de producto (`POST /inventory/initial-count/items`), muestra el avance (productos y unidades) y tiene «Terminar conteo» con confirmación dentro de la página, porque no se puede deshacer. La entrada del menú solo existe mientras el conteo esté abierto (`is_open`); un 409 `initial_count_finished` lleva al resumen del conteo terminado.
- **Movimientos de inventario** (`#/inventario/movimientos`): kárdex paginado, del más reciente al más antiguo, con filtros por producto, tipo y fechas que viven en la dirección (`?product=7&kind=adjustment`). Cada producto de la lista enlaza a su kárdex. El vendedor consulta pero no ve el costo unitario. El dueño usa «Ajustar existencia»: elige «Entran» o «Salen» y una cantidad positiva (la pantalla envía el signo) con un motivo obligatorio; los errores del backend salen junto a cada campo.
- **Buscador de productos** (`src/components/BuscadorDeProductos.tsx`): componente con teclado que usan la pantalla de venta y los filtros de inventario.
- **Siguiente paso:** con el backend 0.4.0 ya no queda nada pendiente. Lo siguiente depende de lo que publique el backend en `docs/backend/CAMBIOS.md` (compras, ventas, caja, taller…).
