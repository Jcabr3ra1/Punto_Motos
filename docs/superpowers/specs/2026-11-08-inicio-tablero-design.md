# Inicio: tablero del negocio con gráficas

## Diseño elegido

Juan eligió la opción **A · Tablero de mando** entre las tres maquetas del
navegador y autorizó ejecutar la implementación directamente. Se respetan el
lenguaje visual del programa y las reglas de
[orden, alineación y adaptación](2026-11-07-rediseno-secciones-y-vistas-design.md).
La maqueta interactiva de referencia queda en la carpeta local sin versionar
`.superpowers/inicio/.superpowers/brainstorm/55445-1794116640/content/inicio-tres-propuestas-v2.html`.

El objetivo es convertir el Inicio del dueño en un tablero del negocio con
gráficas SVG livianas hechas a mano, sin añadir dependencias externas ni
inventar métricas ausentes en el contrato actual del backend (`0.11.0`).

## Distribución y comportamiento

### Vista del dueño (`InicioDelDueno`)

- **Encabezado:** se conserva `EncabezadoDeInicio` con placa, saludo según la
  hora, fecha larga («… · así va el día»), «Recibir compra» (`/compras/lista`)
  y «Nueva venta» (`/venta/vender`, `Ctrl+N`).
- **Fila superior — cuatro instrumentos de igual altura:**
  1. **Caja de hoy** (en negro `--marco` con filete lima): `expected_cash` en
     lima, apertura (`Abrió con … a las …`) y, cuando existe `session.summary`,
     una barra segmentada en SVG con la proporción cobrada hoy en efectivo
     frente a transferencia, más «Ver la caja →». Cerrada: «La caja está
     cerrada» y el botón «Abrir caja».
  2. **Ventas de hoy:** total vendido, conteo de ventas no anuladas (indicando
     cuántas incluyeron servicios de taller si las hubo), gráfica SVG accesible
     de barras por hora (`8 a. m.` a `6 p. m.`, ampliable si hubo ventas fuera
     de ese rango, con la hora actual en oliva `#4a5700`), rango/hora pico y
     «Ver las ventas →».
  3. **Mecánicos hoy:** total por pagar hoy, resumen («Nada por pagar hoy» o
     «por pagar a X mecánicos · Y servicios»), barras horizontales SVG por
     mecánico con su monto y «Liquidar →».
  4. **Cuentas:** «Debo a proveedores» y «Me deben los locales», barra SVG
     proporcional de comparación (`#0b0b0c` frente a `#4a5700`), conteo de
     terceros con saldo y «Ver proveedores →».
- **Fila central (`2fr` + `1fr`) — paneles gráficos principales:**
  1. **Ritmo de ventas:** conmutador con `BotonDeFiltro` entre **7 días** (por
     defecto) y **30 días**, tres cifras resumen (`Vendido`, `Promedio diario`
     y `Mejor día`), gráfica SVG vertical por día en zona horaria de Colombia
     con línea punteada de promedio, etiquetas legibles y resumen accesible.
  2. **Flujo de la caja de hoy:** entradas frente a salidas del día calculadas
     desde `session.summary.by_kind`, barras horizontales SVG por tipo de
     movimiento (positivos en oliva, salidas en rojo ladrillo) y pie que separa
     efectivo neto de transferencias netas. Muestra estado cerrado o resumen no
     disponible sin inventar ceros.
- **Fila inferior (`2fr` + `1fr`):** se conservan «Últimas ventas de hoy»
  (`TablaDeVentas`, 5 filas incluidas anuladas tachadas) e «Ir a» (`Vender`,
  `Productos`, `Liquidación del día` y `Compras`).

### Vista del vendedor (`InicioDelVendedor`)

Permanece intacta: saludo con estado abierto/cerrado de la caja, consulta de
precio y existencia (`/catalog/search`) y tabla «Ventas de hoy» (`cuantas={8}`,
`completa={false}`). No muestra ni solicita montos de caja, mecánicos,
proveedores, locales ni series históricas de varios días.

## Datos y límites honestos del backend (`0.11.0`)

Solo se consumen endpoints documentados en [API.md](../../backend/API.md):

- `GET /sales?date_from=…&date_to=…&voided=false&page_size=200`: recorriendo
  todas las páginas para `Ventas de hoy` y `Ritmo de ventas` (7 o 30 días),
  agrupando horas y fechas en `America/Bogota`.
- `GET /sales?date_from=hoy&date_to=hoy&page_size=5` (o `8` para vendedor):
  últimas ventas incluidas las anuladas.
- `GET /cash-sessions/current`: `expected_cash`, `opening_cash`, `opened_at` y
  `session.summary` (`by_kind`, `cash_total`, `transfer_total`), refrescando
  cada minuto en Inicio.
- `GET /mechanic-settlements/daily`: `total` y `mechanics` por pagar hoy.
- `GET /suppliers?with_debt=true&include_inactive=true` y
  `GET /consignees?with_debt=true&include_inactive=true`: listas sin paginar
  para sumar `balance_due` exacto incluyendo inactivos.

**Qué faltaría en el backend si en el futuro se quisieran otras gráficas:**
1. *Productos o servicios más vendidos:* un endpoint agregado como
   `GET /reports/top-products?date_from=&date_to=` (`Sale` en listado no trae
   líneas `items` ni `services`).
2. *Ganancia o margen del día/mes:* un resumen contable en el backend con
   `cost_price` al momento de cada venta neta de devoluciones y porcentajes de
   mecánicos (`GET /sales` no expone costos ni separa pesos de repuestos frente
   a mano de obra).
3. *Serie diaria preagregada para rangos largos (90 días o un año):*
   `GET /sales/daily-summary?date_from=&date_to=` para evitar recorrer páginas.

## Gráficas, adaptación y piezas

- Gráficas hechas a mano en SVG liviano, sin librerías adicionales ni
  animaciones largas. Colores del sistema: `--marco` (`#0b0b0c`),
  `--color-marca` (`#cde409`, solo sobre negro o como remate de 3px) y
  `--color-acento` (`#4a5700`) / `#cfd4b0` sobre fondos claros.
- Cada gráfica incluye título visible, cifras tabulares alineadas y etiqueta
  accesible (`role="img"` + `aria-label` descriptivo y `<title>` por barra).
- Reutilizar `EncabezadoDePantalla`, `BotonDeFiltro`, `Instrumento` y estilos
  de `.panel-inicio`. Retícula de 4px (`--esp-1` a `--esp-8`), canales de 12px,
  números tabulares a la derecha y ancho máximo de 1600px alineado a la
  izquierda. Estilos nuevos aislados en una sección `/* Inicio */` de
  `frontend/src/index.css`, sin tocar `frontend/src/pages/caja/` ni usar Prettier.
- Comprobar `900 × 560`, `1280 × 800` y `1920 × 1080`. Por debajo de `960px` de
  área (`@container area (max-width: 959px)`), los 4 instrumentos pasan a
  `2 × 2`, las filas `2fr + 1fr` pasan a una columna y `.col-secundaria` se oculta.

## Alternativas consideradas

- **A, elegida (Tablero de mando):** conserva arriba los 4 instrumentos
  conocidos enriquecidos con micro-gráficas, añade la franja central con
  tendencia diaria (7/30 días) y flujo de caja, y deja abajo ventas recientes e
  «Ir a». Equilibra lectura rápida y contexto histórico.
- **B (Cabina negra y lima):** abría con dos paneles oscuros protagonistas
  (ventas 7/30 días y caja) seguidos por una fila de tres tarjetas; daba más
  peso dramático al bloque superior, pero rompía la lectura inmediata de los
  cuatro indicadores del día.
- **C (Cuatro cuadrantes gráficos):** dejaba una franja compacta arriba y una
  matriz `2 × 2` de gráficas dedicadas; ordenaba bien el análisis, pero
  alargaba el recorrido antes de llegar a las últimas ventas.

## Alcance y verificación

Escribir pruebas primero conservando todas las pruebas existentes de
`Inicio.test.tsx`. Cubrir paginación completa en 7/30 días, conmutación entre
`7 días` y `30 días`, gráficas SVG accesibles, flujo de caja con efectivo y
transferencia separados, caja cerrada y resumen ausente, errores aislados por
recuadro y aislamiento estricto de la vista del vendedor. Ejecutar `npm run build`,
`npm run lint` y `npm test` en `frontend/`, revisión visual en los tres tamaños,
`quality-gate` y `revision-cruzada` con `nexakit` sin subagentes. Sin commit,
push, PR, versión ni escritura de memoria sin autorización de Juan.
