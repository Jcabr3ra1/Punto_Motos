# Plan de implementación: Inicio del dueño como panorama general del negocio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No usar subagentes; respetar el modo de ejecución que confirme Juan (modo tutor paso a paso o ejecución directa en la sesión).

**Objetivo:** implementar **A · Panorama primero** en `InicioDelDueno` como tablero general del negocio con datos exactos del contrato actual (`0.11.0`), gráficas SVG propias y desplazamiento vertical interno, conservando intactos `InicioDelVendedor` y los archivos previos.

**Arquitectura:** concentrar las ventas vigentes de hoy, ayer, últimos 7 días y mes en curso en un único recorrido paginado compartido (`usePanoramaDeVentas`), manteniendo consultas independientes para la referencia del mes anterior, devoluciones de hoy, caja actual, liquidación diaria, compras en borrador, proveedores/locales con deuda y existencias por reponer (`useProductosPorReponer`). Presentar la franja de ventas arriba y un cuerpo de dos columnas (`minmax(0, 1fr) 320px`) con encabezado fijo y scroll interno en `.inicio-panorama__cuerpo`, pasando bajo `960px` a una sola columna con `Necesita tu atención` inmediatamente después de la franja de ventas.

**Tecnologías:** React 19, TypeScript, TanStack Query v5, React Router, SVG nativo (`ResizeObserver`), CSS en retícula de 4px (`@container area`), Vitest y Testing Library.

**Diseño:** [Inicio del dueño: panorama general del negocio](../specs/2026-11-08-inicio-panorama-general-design.md).

## Restricciones globales

- Crear rama `feat/inicio-panorama-general` desde `main` actualizado (`git pull`) antes de tocar código; actualmente no hay cambios en el código del programa.
- Conservar todos los archivos y componentes existentes (`Instrumentos.tsx`, `PanelesDeTablero.tsx`, `PorReponer.tsx`, `useVentasDeHoy.ts`, `useVentasPorPeriodo.ts`) e `InicioDelVendedor` (misma presentación, permisos y cero consultas nuevas).
- Usar solo endpoints y filtros vigentes de `docs/backend/API.md` (backend de desarrollo en `http://127.0.0.1:8765/api/v1`); ningún total sale de una primera página truncada ni de una selección visible.
- Pesos enteros con `formatearPesos`; sin redondeos abreviados, sin porcentajes de crecimiento, sin compensar «Debo a proveedores» contra «Me deben los locales» y sin presentar «Vendido» como ganancia o neto de devoluciones.
- Retícula de `4px` (`--esp-1` a `--esp-8`), canales de `12px`, ancho máximo `1600px` alineado a la izquierda, marco `#0b0b0c`, lima `#cde409`, oliva `#4a5700`; comprobar `900 × 560`, `1280 × 800` y `1920 × 1080`.
- Encabezado y marco fijos; un único contenedor interno desplazable en Inicio, sin mover `html` ni `body` y sin scroll horizontal.
- Botones e importes completos sin puntos suspensivos ni palabras abreviadas o partidas; gráficas en SVG propio accesible, sin librerías nuevas ni Prettier.
- Pruebas primero (TDD); conservar todas las pruebas existentes adaptando solo expectativas de presentación reemplazadas por el diseño aprobado.
- Sin revisión cruzada por ahora; commit, push, PR, merge, publicación y escritura en memoria solo con autorización explícita de Juan.

## Foco de revisión

1. **Fallo en página `>= 2` de `/sales` o `/sale-returns` (`> 200` registros):** la consulta debe fallar completa y ofrecer «Reintentar», jamás mostrar la suma parcial de la página 1 como si fuera el total.
2. **Fin de mes, febrero y cambio de año en la referencia del mes anterior (`2026-03-31`, `2028-03-31`, `2026-01-15`):** limitar el intervalo al último día real del mes previo (`28` o `29` de febrero, `30` en meses de 30 días, diciembre del año anterior) y mostrar el rango explícito («Del 1 al 28 de febrero»).
3. **Mecánico con servicios pendientes hoy pero neto `amount = 0` por descuentos (`bad_service`):** sigue requiriendo liquidación, por lo que debe contarse en «Necesita tu atención» aclarando neto `$ 0`.
4. **Error inicial o fallo de recarga (`isRefetchError`) en existencias, liquidación o borradores:** nunca declarar «Sin pendientes de operación» ni mostrar conteos viejos en atención como actuales; en los paneles con dato previo en caché, rotularlo como «Último dato válido» con su fecha/hora, aviso de actualización fallida y «Reintentar».
5. **Venta o apertura de caja cerca de medianoche UTC (`2026-11-09T04:30:00Z` = `23:30` del `2026-11-08` en `America/Bogota`):** agrupar ventas y evaluar si la caja sigue abierta desde «ayer» u otra fecha siempre en calendario de Colombia, nunca en UTC.

---

## Mapa de archivos

- **Modificar** `frontend/src/utilidades/fechas.ts`: utilidades puras de calendario en Colombia (`inicioDeMes`, `intervaloMesAnteriorComparable`, `formatearIntervaloDeFechas`, `formatearDiaLargo`).
- **Modificar** `frontend/src/utilidades/periodos.test.ts`: pruebas unitarias de intervalos mensuales, años bisiestos, cambio de año y textos de rangos.
- **Crear** `frontend/src/hooks/usePanoramaDeVentas.ts`: `usePanoramaDeVentas(hoy, cadaCuanto)` (recorrido único compartido para hoy/ayer/7d/mes + consulta aislada de mes anterior comparable, ambas bajo `claves.ventas`) y `useDevolucionesDeHoy(hoy, cadaCuanto)` (recorrido completo de `/sale-returns` bajo `claves.devoluciones`).
- **Modificar** `frontend/src/pages/inicio/Graficas.tsx`: agregar `GraficaTendenciaDeVentas` conservando intactas las gráficas existentes.
- **Modificar** `frontend/src/pages/inicio/TablaDeVentas.tsx`: añadir prop opcional `reciboEnVentana?: boolean` para abrir `VentanaDeRecibo` desde el número de recibo en `InicioDelDueno` sin alterar `InicioDelVendedor`.
- **Crear** `frontend/src/pages/inicio/PanoramaPrincipal.tsx`: `AvisoDeCajaAnterior`, `FranjaDeVentas`, `TendenciaDeVentas`, `CuentasDelNegocio` y pieza auxiliar de pie de error/«Último dato válido».
- **Crear** `frontend/src/pages/inicio/PanoramaSecundario.tsx`: `NecesitaTuAtencion`, `ResumenDeCaja`, `ExistenciasPorReponer` y `DevolucionesDeHoy`.
- **Modificar** `frontend/src/pages/inicio/InicioDelDueno.tsx`: encabezado fijo «Así va tu negocio» con corte real, consultas compartidas y disposición adaptable (`>= 960px` dos columnas; `< 960px` una columna con atención arriba via `useAreaAngosta`).
- **Modificar** `frontend/src/index.css`: estilos de `.inicio--panorama` dentro de la sección `/* Inicio */`, sin tocar `pages/caja/` ni reglas globales ajenas.
- **Modificar** `frontend/src/pages/inicio/Inicio.test.tsx`: adaptar expectativas del Inicio del dueño al diseño aprobado, conservar `saludoSegunHora`, existencias e `InicioDelVendedor`, y cubrir criterios nuevos y foco de revisión.

---

### Tarea 1: Fechas de calendario y consultas exactas del panorama

**Archivos:**
- Modificar: `frontend/src/utilidades/fechas.ts`
- Crear: `frontend/src/hooks/usePanoramaDeVentas.ts`
- Pruebas: `frontend/src/utilidades/periodos.test.ts`, `frontend/src/pages/inicio/Inicio.test.tsx`

**Interfaces:**
- Produce en `fechas.ts`:
  - `inicioDeMes(dia: string): string` → `'AAAA-MM-01'`.
  - `intervaloMesAnteriorComparable(hoy: string): { desde: string; hasta: string }` → del día `1` del mes previo a `Math.min(diaDelMes, ultimoDiaMesPrevio)`.
  - `formatearIntervaloDeFechas(desde: string, hasta: string, hoyReferencia?: string): string` → p. ej. `'1 de noviembre'`, `'Del 1 al 8 de noviembre'`, `'Del 28 de octubre al 3 de noviembre'`, `'Del 1 al 15 de diciembre de 2025'`.
  - `formatearDiaLargo(dia: string): string` → `'Domingo 8 de noviembre de 2026'` sobre `AAAA-MM-DD` sin desfase horario.
- Produce en `usePanoramaDeVentas.ts`:
  - `ResumenDeTramo { desde: string; hasta: string; total: number; cantidad: number; serie: DiaDeVentas[]; mejorDia: DiaDeVentas | null }`
  - `DatosDePanoramaDeVentas { hoy: { fecha: string; total: number; cantidad: number }; ayer: { fecha: string; total: number; cantidad: number }; sieteDias: ResumenDeTramo; mes: ResumenDeTramo }`
  - `usePanoramaDeVentas(hoy: string, cadaCuanto?: number)` → `{ actual: UseQueryResult<DatosDePanoramaDeVentas>, mesAnterior: UseQueryResult<{ desde: string; hasta: string; total: number; cantidad: number }>, intervaloMesAnterior: { desde: string; hasta: string } }`.
    - `actual` pide `listarVentas({ date_from: min(inicioDeMes(hoy), moverDia(hoy, -6)), date_to: hoy, voided: false, page_size: 200, page })` recorriendo todas las páginas bajo `[...claves.ventas, 'panorama-actual', hoy]`.
    - `mesAnterior` pide `listarVentas({ date_from: ant.desde, date_to: ant.hasta, voided: false, page_size: 200, page })` recorriendo todas las páginas bajo `[...claves.ventas, 'panorama-mes-anterior', ant.desde, ant.hasta]` con `staleTime: 5 * 60_000`.
  - `useDevolucionesDeHoy(hoy: string, cadaCuanto?: number)` → `UseQueryResult<{ total: number; cantidad: number }>` recorriendo todas las páginas de `listarDevoluciones({ date_from: hoy, date_to: hoy, page_size: 200, page })` bajo `[...claves.devoluciones, 'panorama-hoy', hoy]`.

- [ ] **Paso 1: Escribir pruebas en rojo para intervalos mensuales y cambios de año** en `frontend/src/utilidades/periodos.test.ts` (`'calcula el intervalo comparable del mes anterior respetando febrero, meses de 30 días y cambio de año'`: `'2026-03-31'` → `2026-02-01..2026-02-28`, `'2028-03-31'` → `2028-02-01..2028-02-29`, `'2026-05-31'` → `2026-04-01..2026-04-30`, `'2026-01-15'` → `2025-12-01..2025-12-15`, y textos `'Del 1 al 28 de febrero'` / `'Del 1 al 15 de diciembre de 2025'`).
- [ ] **Paso 2: Ejecutar pruebas de utilidades y confirmar el fallo esperado** con `npm test --prefix frontend -- --run src/utilidades/periodos.test.ts`.
- [ ] **Paso 3: Implementar `inicioDeMes`, `intervaloMesAnteriorComparable`, `formatearIntervaloDeFechas` y `formatearDiaLargo`** en `frontend/src/utilidades/fechas.ts` usando aritmética `Date.UTC` pura y `Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', ... })` sobre fechas `AAAA-MM-DD`, y crear `frontend/src/hooks/usePanoramaDeVentas.ts`.
- [ ] **Paso 4: Ejecutar `npm test --prefix frontend -- --run src/utilidades/periodos.test.ts`** y comprobar que pasa en verde.

---

### Tarea 2: Encabezado, aviso de caja, franja de ventas, tendencia SVG, cuentas y recibo emergente

**Archivos:**
- Modificar: `frontend/src/pages/inicio/Graficas.tsx`
- Modificar: `frontend/src/pages/inicio/TablaDeVentas.tsx`
- Crear: `frontend/src/pages/inicio/PanoramaPrincipal.tsx`
- Pruebas: `frontend/src/pages/inicio/Inicio.test.tsx`

**Interfaces:**
- Consume: `DatosDePanoramaDeVentas`, `usePanoramaDeVentas`, `formatearIntervaloDeFechas`, `diaEnColombia`, `moverDia`, `VentanaDeRecibo` (`pages/venta/DetalleDeVenta.tsx`).
- Produce:
  - `GraficaTendenciaDeVentas({ serie, desde, hasta, total, mejorDia, periodo }: { serie: DiaDeVentas[]; desde: string; hasta: string; total: number; mejorDia: DiaDeVentas | null; periodo: '7dias' | 'mes' })` en `Graficas.tsx`: barras SVG desde `0` (`#cfd4b0` días completos, `#4a5700` + remate `#cde409` en `Hoy`), `role="img"`, `aria-label` con período, total, mejor día y aclaración de hoy en curso, y etiquetas del eje X sin superposición (todas en `7dias`; hitos espaciados + `Hoy` en `mes`).
  - `EstadoDeDatoActualizado`: bloque compacto reutilizable en `PanoramaPrincipal.tsx` que distingue error inicial («No se pudo…» + botón «Reintentar») de `isRefetchError` con dato previo en caché («Último dato válido: [fecha y hora] · No se pudo actualizar» + botón «Reintentar»).
  - `AvisoDeCajaAnterior({ hoy, caja })`: franja de alerta antes de indicadores solo cuando `caja.data?.is_open` y `diaApertura < hoy` («La caja sigue abierta desde ayer» o «La caja sigue abierta desde el [fecha]» + enlace «Revisar caja» a `/caja/actual`).
  - `FranjaDeVentas({ hoy, actual, mesAnterior, intervaloMesAnterior })`:
    - Celda oscura **Vendido hoy**: total, `{n} ventas vigentes · Día en curso`, línea `Ayer completo` con su total y enlace «Ver ventas de hoy» (`/venta/historial?periodo=hoy&voided=false`).
    - Celda clara **Vendido este mes**: total, `{intervalo} · {n} ventas`, línea del intervalo real del mes anterior (con error aislado si solo falla `mesAnterior`) y enlace «Ver ventas del mes» (`/venta/historial?periodo=mes&voided=false`).
    - Pie común: «Ventas sin anuladas. Devoluciones aparte. Hoy sigue en curso; ayer y los días anteriores están completos.»
  - `TendenciaDeVentas({ actual })`: región «Cómo vienen las ventas» con `BotonDeFiltro` para `7 días` (activo al abrir) y `Este mes`, total e intervalo, `GraficaTendenciaDeVentas`, leyenda (`Días completos` / `Hoy en curso`) y nota de `Mejor día` (o ausencia de ventas) indicando que incluye repuestos y servicios.
  - `CuentasDelNegocio()`: región «Cuentas del negocio» con dos columnas separadas («Debo a proveedores» con conteo y enlace «Ver proveedores» a `/compras/proveedores`; «Me deben los locales» con conteo y enlace «Ver locales» a `/consignacion/locales`), ambas con `with_debt: true, include_inactive: true` y carga/error independientes.
  - `TablaDeVentas` con `reciboEnVentana?: boolean`: cuando es `true`, el recibo `#0412` es un `<button type="button" className="tabla__codigo">` que abre `<VentanaDeRecibo>` sin abandonar Inicio.

- [ ] **Paso 1: Añadir y adaptar pruebas en `Inicio.test.tsx`** para:
  - Encabezado «Así va tu negocio», enlaces «Nueva venta» (`/venta/vender`) y «Recibir compra» (`/compras/lista`), sin hora fija inventada cuando las consultas fallan.
  - Aviso «La caja sigue abierta desde ayer» (incluyendo apertura a las `23:30` Colombia / `04:30Z` del día siguiente cuando ya cambió el día) y ausencia del aviso cuando abrió hoy.
  - `FranjaDeVentas` recorriendo `> 200` ventas, fallo en página `2` sin mostrar total parcial, comparación real del mes anterior sin porcentajes, fallo aislado de `mesAnterior` conservando `Vendido este mes`, y enlaces exactos `?periodo=hoy&voided=false` y `?periodo=mes&voided=false`.
  - `Cómo vienen las ventas` con cambio entre `7 días` y `Este mes` (día `1` a `hoy`, distinto de `30` días) reutilizando la misma consulta `panorama-actual` sin repetir llamadas a `/sales`.
  - `Cuentas del negocio` con `include_inactive=true`, sin compensar saldos y con enlaces «Ver proveedores» y «Ver locales».
  - `Últimas ventas de hoy` abriendo el recibo en `VentanaDeRecibo` emergente al pulsar `#0412`.
- [ ] **Paso 2: Ejecutar `npm test --prefix frontend -- --run src/pages/inicio/Inicio.test.tsx`** y verificar los fallos en rojo.
- [ ] **Paso 3: Implementar `GraficaTendenciaDeVentas`, `TablaDeVentas` (`reciboEnVentana`) y `PanoramaPrincipal.tsx`.**

---

### Tarea 3: Columna operativa, integración adaptable, estilos y verificación completa

**Archivos:**
- Crear: `frontend/src/pages/inicio/PanoramaSecundario.tsx`
- Modificar: `frontend/src/pages/inicio/InicioDelDueno.tsx`
- Modificar: `frontend/src/index.css`
- Pruebas: `frontend/src/pages/inicio/Inicio.test.tsx`

**Interfaces:**
- Consume: `useProductosPorReponer`, `useCajaActual`, `consultarLiquidacionDelDia`, `listarCompras`, `useDevolucionesDeHoy`, `useAreaAngosta` y los bloques de `PanoramaPrincipal.tsx`.
- Produce en `PanoramaSecundario.tsx`:
  - `NecesitaTuAtencion({ existencias, liquidacion, borradores })`: región «Necesita tu atención» con pastilla `{n} asunto(s)` (conteo de categorías pendientes o en error, no suma heterogénea) o `Al día`, en orden fijo:
    1. Productos agotados (`stock <= 0`) o con existencia baja (`stock > 0 && is_low_stock`), enlace «Revisar» a `/inventario/productos`.
    2. Mecánicos de hoy por liquidar (`mechanics` con `services_count > 0`, incluido `amount === 0` por descuentos), enlace «Liquidar» a `/taller/liquidacion`.
    3. Compras en borrador (`GET /purchases?status=draft&page_size=1` sin filtro de fecha, usando `count`), enlace «Revisar» a `/compras/lista?status=draft&periodo=todas`.
    - Oculta categorías resueltas (`0`). Solo muestra «Sin pendientes de operación» (explicando qué tres áreas comprobó) cuando las tres consultas están en éxito sin error de recarga. Si alguna falla (carga inicial o recarga fallida), muestra su fila con aviso y botón «Reintentar».
  - `ResumenDeCaja({ hoy, caja })`: región «Caja» oscura con `expected_cash` en lima, texto de apertura (`Abrió hoy…` / `Abierta desde ayer…` / `Abierta desde el …`), `Base de apertura`, pie «Transferencias fuera del cajón» + enlace «Ver caja» (`/caja/actual`); cerrada: «La caja está cerrada» + «Abrir caja»; error o sesión ausente sin inventar `$ 0` + «Reintentar» / «Último dato válido».
  - `ExistenciasPorReponer({ existencias })`: región «Existencias por reponer» separando conteo de `agotados` y `con existencia baja` sin doble conteo, hasta `6` filas urgentes (`nombre`, `código`, `Agotado` o `{stock} de mínimo {min_stock}`), `y {n} más`, hora de revisión (`dataUpdatedAt`), enlace «Ver productos» (`/inventario/productos`), estado vacío («Ningún producto activo está en su mínimo.») y error («No se pudieron consultar las existencias» + «Reintentar»).
  - `DevolucionesDeHoy({ hoy })`: región «Devoluciones de hoy» recorriendo todas las páginas de `GET /sale-returns?date_from=hoy&date_to=hoy&page_size=200`, mostrando cantidad y suma de `total`, aclaración de que pueden corresponder a ventas anteriores, enlace «Ver devoluciones» (`/venta/devoluciones?periodo=hoy`), estado cero («No hay devoluciones hoy») y error/«Último dato válido».
- Produce en `InicioDelDueno.tsx` e `index.css`:
  - Contenedor `.inicio.inicio--panorama` con `.inicio-panorama__encabezado` fijo (`formatearDiaLargo(hoy)` y corte real solo de las fuentes ligeras actualizadas con éxito, sin mostrar una hora común exitosa si alguna falló; las consultas ligeras y de ventas se refrescan al volver a Inicio y cada minuto) y `.inicio-panorama__cuerpo` desplazable (`overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain`).
  - Con `useAreaAngosta() === false` (`>= 960px`): dos columnas (`minmax(0, 1fr) 320px`) y franja de ventas en dos celdas de igual altura. Con `useAreaAngosta() === true` (`< 960px`): cuerpo en una columna en orden DOM y de teclado `NecesitaTuAtencion → TendenciaDeVentas → CuentasDelNegocio → ResumenDeCaja → ExistenciasPorReponer → DevolucionesDeHoy → TablaDeVentas` (y las dos celdas de `FranjaDeVentas` pasan a una columna cuando el ancho real no permite mostrar importes completos sin apretarlos), respaldado en CSS por `@container area`.

- [ ] **Paso 1: Añadir pruebas en `Inicio.test.tsx`** para:
  - `Necesita tu atención`: conteo de categorías (`3 asuntos` / `1 asunto`), mecánico con `services_count > 0` y `amount = 0` contado como pendiente, compras en borrador sin `date_from`/`date_to` y enlace `/compras/lista?status=draft&periodo=todas`, ocultación de resueltas, «Sin pendientes de operación», y error en existencias con botón «Reintentar» tanto en atención como en el panel sin declarar que todo está al día.
  - `Existencias por reponer`: separación exacta entre agotados (`stock = 0`) y existencia baja (`stock > 0`) sin duplicar conteos, hasta 6 ítems + `y 3 más`, hora de revisión visible y recorrido paginado cada 5 minutos.
  - `Devoluciones de hoy`: suma exacta con `> 200` devoluciones en varias páginas, separación respecto a `Vendido hoy`, enlace `/venta/devoluciones?periodo=hoy` y mensaje «No hay devoluciones hoy».
  - Fallo de actualización con dato previo en caché (`isRefetchError`): muestra «Último dato válido» con fecha/hora, aviso de actualización fallida y «Reintentar».
  - `InicioDelVendedor`: conserva intactos sus textos y buscador, y no realiza llamadas a `/mechanic-settlements`, `/suppliers`, `/consignees`, `/products`, `/purchases`, `/sale-returns` ni `/sales?...voided=false`.
  - Orden de una columna cuando `#contenido` mide `< 960px` (`Necesita tu atención` aparece antes de `Cómo vienen las ventas` y `Últimas ventas de hoy`).
- [ ] **Paso 2: Ejecutar `npm test --prefix frontend -- --run src/pages/inicio/Inicio.test.tsx`** y observar los fallos esperados de los bloques nuevos antes de conectar `InicioDelDueno`.
- [ ] **Paso 3: Implementar `PanoramaSecundario.tsx`, conectar `InicioDelDueno.tsx` y añadir los estilos `.inicio--panorama` bajo `/* Inicio */` en `frontend/src/index.css`.**
- [ ] **Paso 4: Ejecutar `npm test --prefix frontend -- --run src/pages/inicio/Inicio.test.tsx`** hasta que pasen todas las pruebas en verde.
- [ ] **Paso 5: Ejecutar verificación completa del frontend:**
  - `npm run build --prefix frontend` (`tsc -b && vite build` sin errores)
  - `npm run lint --prefix frontend` (`oxlint` con `0` advertencias y `0` errores)
  - `npm test --prefix frontend -- --run` (toda la suite en verde)
- [ ] **Paso 6: Comprobar visualmente en Chromium real los tamaños `900 × 560`, `1280 × 800` y `1920 × 1080`** (día en marcha, caja abierta desde ayer, sin pendientes, error en existencias, contenido largo con desplazamiento interno sin mover `html`/`body` y vista del vendedor), usando el backend de desarrollo en el puerto `8765` o datos controlados de verificación cuando se prueben bordes (>200 registros / errores).
- [ ] **Paso 7: Aplicar `quality-gate`** (`git status -sb`, `git diff --check`, revisar que no se hayan borrado archivos previos ni tocado `pages/caja/`).
- [ ] **Paso 8 (solo con autorización explícita de Juan):** crear commit con Conventional Commits en español, push, PR, merge o cierre de memoria según lo que autorice.
