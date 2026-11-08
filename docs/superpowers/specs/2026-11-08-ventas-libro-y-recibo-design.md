# Ventas: libro y recibo negro

## Diseño elegido

Juan eligió la opción **A · Libro + recibo negro** entre las tres maquetas del
navegador (carpeta local sin versionar
`.superpowers/brainstorm/158-1794144453/content/ventas-tres-propuestas.html`).
Se aplica el lenguaje de Vender y Caja de hoy y las reglas de
[orden, alineación y adaptación](2026-11-07-rediseno-secciones-y-vistas-design.md).

Esta distribución es la **base para las demás pantallas de listas**. Juan pidió
revisar cada pantalla y decidir en cada una si vale la pena aplicarla: con
detalle (lista + registro negro) o sin detalle (lista con pie fijo, sin panel).

## Distribución

- **Encabezado** y **franja de indicadores** sin cambios: ventas de hoy, total
  de hoy y anuladas hoy.
- **Barra de filtros** (`BarraDeFiltros`):
  - búsqueda por **N.º de recibo** con la tecla `/`;
  - período como botones: **Hoy** (al abrir), **7 días**, **Este mes**,
    **Todas las fechas** y **Fechas**, que muestra los campos **Desde** y **Hasta**;
  - estado como botones: **Todas**, **Vigentes**, **Anuladas**;
  - **Mecánico** como lista con forma de botón;
  - a la derecha, cuántas ventas hay.
  - Todos los filtros se combinan. Si se busca un número de recibo, se busca en
    todas las fechas, porque quien lo escribe quiere esa venta aunque no sea de
    hoy; la barra lo dice («en todas las fechas»).
- **Libro** a la izquierda: tabla con cabecera fija, desplazamiento interno y
  **pie fijo** con «Atrás» y «Siguiente» siempre visible. Cada página trae
  **las filas enteras que caben** (filas de 48px, `useFilasQueCaben`; 20 si no se
  puede medir), para que ninguna quede cortada; a pedido de Juan.
  Columnas: Recibo (pastilla del número, «Anulada», servicios), Fecha (solo la
  hora si el período es Hoy), Cliente (con teléfono), Vendió (secundaria) y
  Total a la derecha. Flechas y clic eligen; Esc cierra el detalle.
- **Registro negro** a la derecha (300px): la venta elegida como recibo. Número, total grande
  en lima, «Anulada» si aplica, cliente, vendió, pagó con, fecha, productos y
  servicios (con su mecánico) y, al pie, **Abrir el recibo** en lima y
  «Cerrar». Sin venta elegida muestra «Elige una venta para ver su recibo».
- Anular y devolver siguen en «Abrir el recibo», sin cambios.

## Devoluciones

Se aplicó la misma distribución (tiene detalle por fila). Diferencias decididas:

- Abre en **Todas las fechas**: las devoluciones son pocas y en Hoy casi siempre
  saldría vacía; además conserva cómo abría antes.
- Causa como botones: **Todas**, **Otra causa**, **Mal servicio**.
- La venta de origen va debajo del número de la devolución y el motivo se corta
  en una línea con el texto completo en `title`, para que las filas no crezcan.
- Búsqueda por **N.º de devolución**, en todas las fechas como en Ventas.
- El detalle pasa al registro negro con «Abrir el comprobante».

## Datos

Solo `GET /sales` (con `number`, `mechanic`, `voided`, `date_from`, `date_to`,
`page`, `page_size` = las filas que caben) y `GET /sales/{id}`. Los rangos se calculan con el día de
Colombia (`useHoy`): Hoy = hoy a hoy; 7 días = hoy − 6 a hoy; Este mes = día 1
del mes a hoy; Todas = sin fechas. La URL guarda los filtros (`periodo`,
`date_from`, `date_to`, `voided`, `mechanic`, `number`, `page`); una URL vieja con
`date_from` o `date_to` y sin `periodo` se entiende como «Fechas».

## Piezas reutilizables

- `components/Registro.tsx`: el panel negro de detalle. En área ancha va al lado
  del libro; en área angosta (< 960px) se abre como `PanelLateral`, como `Ficha`.
- Clases `.libro`, `.libro__lista` y `.registro` en `index.css`, aparte de las de
  Caja (no se toca `pages/caja/`).
- `utilidades/periodos.ts`: el rango de fechas de cada período.

## Adaptación

≥ 960px de área: libro + registro de 300px. Menos de 960px: el libro ocupa todo
el ancho, «Vendió» se oculta y el detalle se abre como panel lateral al elegir
una venta. Comprobar 900 × 560, 1280 × 800 y 1920 × 1080.

## Alcance y verificación

Conservar las pruebas existentes y cambiar solo lo que la nueva barra exige
(los filtros pasan de listas a botones, el período Hoy entra en la consulta y el
estado vacío depende del período). Agregar pruebas de los períodos, «Fechas»,
la búsqueda por recibo en todas las fechas, el pie fijo y el registro vacío.
Ejecutar build, lint y toda la suite. Sin revisión cruzada en esta etapa (Juan
la pidió omitir mientras arregla nexakit).

## Inventario (siguiente etapa)

Decidido pantalla por pantalla, como pidió Juan:

- **Productos: sí, libro + registro negro.** La ficha (código, precio, costo y
  margen solo para el dueño, existencia, ubicación, tipo, marca, motos y los 5
  últimos movimientos) pasa al registro, con «Editar» en lima y «Ver
  movimientos». Barra: búsqueda con `/`, Tipo y Moto como listas con forma de
  botón (`ListaDeFiltro`), botones «Insumos de taller» y «Desactivados» (solo
  el dueño) y «Ordenar por». «Bajo el costo» va como texto bajo el precio.
  Filas que caben y pie fijo.
- **Movimientos: libro sin registro** (`libro--sin-registro`), porque no hay
  detalle por fila. Abre en **Todas las fechas** para que el kárdex de un
  producto, abierto desde Productos, se vea completo. Barra: buscador de
  producto compacto, período, Tipo como lista. El motivo se corta en una línea
  con el texto completo en `title` y «Hecho por» es secundaria.
- **Tipos, marcas y motos: libro sin registro**, a pedido de Juan. «Nuevo tipo /
  marca / moto» pasa al encabezado; la barra tiene los botones de sección, una
  búsqueda por nombre o sigla sin tildes y los botones Todos, Activos e
  Inactivos. Como la API entrega las listas completas, buscar, filtrar y
  paginar (filas que caben, pie fijo) se hace en el programa. Editar es un
  icono de lápiz; el formulario sigue en el panel lateral.
- **Inventario inicial: no.** Es un conteo, no un historial que se recorre.
- **Inicio:** se quitó «Ir a» y se agregó «Se están acabando» (productos con
  `is_low_stock`, del agotado al que apenas llegó al mínimo). Como la API no
  tiene filtro de existencia baja, recorre el catálogo en páginas de 200 cada
  5 minutos; con un filtro del backend sería una sola consulta. En la Caja de
  hoy, el cobro se lee como leyenda («Efectivo 70 %», «Transferencia 30 %»)
  sin abreviar ni partir palabras.
