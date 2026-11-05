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

Para ejecutar la ventana de escritorio con inicio automático de Django, sigue [desktop/README.md](../desktop/README.md). `src/desktop/InicioDesktop.tsx` espera la configuración de Rust antes de montar la aplicación; en navegador conserva el flujo descrito a continuación. La credencial de escritorio se recibe en memoria, no mediante un archivo `.env`.

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
- **Venta** (`#/venta`, backend 0.6.0), pestañas Vender y Ventas:
  - **Vender:** carrito en la ventana con el buscador (los agotados no se eligen y los resultados de la búsqueda anterior tampoco, para que un Enter rápido no agregue el producto equivocado), cliente obligatorio (buscar o crear, con teléfono), pago en transferencia y efectivo con el vuelto calculado en la ventana y «Cobrar» con `idempotency_key`: la misma clave en los reintentos de una venta y una nueva para la siguiente. Solo el dueño cambia el precio (se envía `unit_price` únicamente si cambió). Sin caja abierta o con el inventario inicial abierto no se cobra. Al terminar se muestra el recibo con lo que confirmó el backend.
  - **Ventas:** historial con filtros en la dirección, recibo de cada venta y «Anular» solo para el dueño, con motivo (las unidades vuelven y los pagos se reembolsan).
- **Inventario inicial** (solo el dueño, `#/inventario-inicial`): carga productos nuevos con su «Cantidad contada» reutilizando el formulario de producto (`POST /inventory/initial-count/items`), muestra el avance (productos y unidades) y tiene «Terminar conteo» con confirmación dentro de la página, porque no se puede deshacer. La entrada del menú solo existe mientras el conteo esté abierto (`is_open`); un 409 `initial_count_finished` lleva al resumen del conteo terminado.
- **Movimientos de inventario** (`#/inventario/movimientos`): kárdex paginado, del más reciente al más antiguo, con filtros por producto, tipo y fechas que viven en la dirección (`?product=7&kind=adjustment`). Cada producto de la lista enlaza a su kárdex. El vendedor consulta pero no ve el costo unitario. El dueño usa «Ajustar existencia»: elige «Entran» o «Salen» y una cantidad positiva (la pantalla envía el signo) con un motivo obligatorio; los errores del backend salen junto a cada campo.
- **Buscador de productos** (`src/components/BuscadorDeProductos.tsx`): componente con teclado que usan la pantalla de venta y los filtros de inventario.
- **Compras** (solo el dueño, `#/compras`, backend 0.5.0): sección con pestañas Compras, Proveedores y Abonos.
  - **Compras:** lista paginada con filtros en la dirección (proveedor, estado, pago y fechas). El borrador se arma con el buscador de productos (incluye agotados) y el costo por unidad precargado con `cost_price`; se guarda, se edita (las líneas reemplazan a las anteriores) y se borra con confirmación. «Recibir compra» pide confirmación, admite un abono con la mercancía y muestra los precios que subieron (`price_changes`). Con cambios sin guardar no se puede recibir. La compra recibida es de solo lectura y permite abonarle.
  - **Proveedores:** lo que se les debe, búsqueda, alta, edición y desactivación (no se borran), estado de cuenta (compras con saldo y abonos) y «Abonar».
  - **Abonos:** lista con filtros y registro de abonos a una compra o a las más antiguas primero. No se editan ni se borran.
- **Taller** (backend 0.7.0 y 0.8.0):
  - **En la venta:** escribir solo números en el buscador (por ejemplo `101`) ofrece el servicio con ese código; también hay un desplegable «Agregar servicio». Cada servicio pide mecánico (obligatorio), placa y descripción si el tipo la exige; solo el dueño cambia la mano de obra (`labor_price` se envía únicamente si cambió). La venta puede ser solo de servicios. El recibo muestra cada servicio con su mecánico y placa, y el historial filtra por mecánico.
  - **Configuración → Tipos de servicio y Mecánicos** (solo el dueño). En mecánicos, el porcentaje vacío se envía como `null` (usa el general de «Datos del negocio»).
  - **Taller → Liquidación del día** (solo el dueño): lo que se le debe a cada mecánico, «Pagar» con confirmación y medio de pago, y la hoja de servicios pagados. **Historial de liquidaciones** con filtros y detalle.
  - **Consumo del taller** (en Movimientos, solo el dueño): salida de insumos de taller sin cobrarlos.
- **Caja** (solo el dueño, `#/caja`): abrir con el efectivo sugerido, cifras (inicial, esperado, transferencias), resumen por tipo, movimientos, gastos y retiros con motivo, cierre con el contado y la diferencia en vivo (explicación obligatoria si no cuadra) e historial de cajas.
- **Consignación** (solo el dueño, `#/consignacion`): locales con lo que deben y lo que todavía tienen; entregas con el valor pactado precargado con el costo y `idempotency_key`; reportes armados desde `pending-items` (los errores de línea se asocian por la posición de lo enviado); pagos de los locales.
- **Errores anidados:** `desglosarError` aplana errores como `{ payment: { amount: [...] } }` a `payment.amount` y los de listas a `items.1.quantity`.
- **Siguiente paso:** con el backend 0.8.0 ya no queda nada pendiente. Lo siguiente depende de lo que publique el backend en `docs/backend/CAMBIOS.md` (devoluciones, cierres, impresión…).
