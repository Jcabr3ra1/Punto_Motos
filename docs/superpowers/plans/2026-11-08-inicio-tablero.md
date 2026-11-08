# Plan de implementación: Inicio como tablero del negocio

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. No usar subagentes; Juan autorizó ejecución directa en la sesión.

**Objetivo:** implementar A · Tablero de mando en `Inicio` con gráficas SVG hechas a mano y datos reales de la API.

**Arquitectura:** enriquecer los cuatro instrumentos superiores del dueño y añadir una fila gráfica central (`RitmoDeVentas` + `FlujoDeCaja`) sobre consultas independientes con refresco cada minuto, manteniendo intactos `TablaDeVentas`, «Ir a» e `InicioDelVendedor`.

**Tecnologías:** React, TypeScript, TanStack Query, SVG nativo, CSS, Vitest y Testing Library.

**Diseño:** [Inicio: tablero del negocio con gráficas](../specs/2026-11-08-inicio-tablero-design.md).

## Restricciones globales

- Rama `feat/rediseno-inicio-tablero` creada desde `main` actualizado con `git pull`.
- No tocar `frontend/src/pages/caja/`; estilos nuevos en sección `/* Inicio */` de `frontend/src/index.css`.
- Retícula de 4px (`--esp-1` a `--esp-8`), canales de 12px, números tabulares a la derecha.
- Ventanas `900 × 560`, `1280 × 800` y `1920 × 1080`; corte de contenedor en `960px`.
- Sin librerías de gráficas, sin endpoints inventados y sin Prettier.
- Pruebas primero; no borrar pruebas existentes.
- Sin commit, push, PR, versión ni escritura de memoria sin autorización.

## Foco de revisión

1. Paginación completa (`page_size=200`) tanto en `Ventas de hoy` como en `Ritmo de ventas` (7 y 30 días).
2. Agrupación horaria y diaria estricta en zona horaria `America/Bogota`, sin desfases por UTC o reloj local.
3. Separación clara entre efectivo y transferencia en `Caja de hoy` y `Flujo de la caja de hoy`, distinguiendo caja cerrada, sesión sin movimientos y `summary` ausente.
4. Aislamiento del vendedor (`seller`): cero peticiones a liquidaciones, proveedores, locales o series históricas del dueño, y estados de carga/error independientes por panel.
5. Contraste AA (lima `#cde409` solo sobre negro; oliva `#4a5700` sobre blanco) y ajuste limpio en `900 × 560`, `1280 × 800` y `1920 × 1080`.

## Tarea 1: consultas exactas de ventas y refresco de caja

**Archivos:** `frontend/src/utilidades/fechas.ts`, `frontend/src/hooks/useCajaActual.ts`, `frontend/src/hooks/useVentasDeHoy.ts`, `frontend/src/hooks/useVentasPorPeriodo.ts` y `frontend/src/pages/inicio/Inicio.test.tsx`.

**Interfaces:**
- `moverDia(dia: string, desplazamiento: number): string` y `diaEnColombia(iso: string): string | null` en `fechas.ts`.
- `useCajaActual(cadaCuanto?: number)`: añade `refetchInterval` opcional sin alterar llamadores existentes.
- `VentasDeHoy`: añade `conTaller: number` y `horaPico: { hora: number; total: number } | null` conservando `cantidad`, `total` y `porHora`.
- `useVentasPorPeriodo(dias: 7 | 30, cadaCuanto?: number)`: consulta `listarVentas({ date_from, date_to: hoy, voided: false, page_size: 200, page })` hasta agotar `next`, devolviendo serie diaria cronológica en `America/Bogota`, `total`, `cantidad`, `promedioDiario` y `mejorDia`.

- [x] Añadir pruebas en `Inicio.test.tsx` que exijan paginación completa del período de 7 días, cambio a 30 días, conteo `conTaller` y aislamiento por `date_from` en `Ventas de hoy`.
- [x] Ejecutar `npm test --prefix frontend -- --run src/pages/inicio/Inicio.test.tsx` y observar el fallo esperado.
- [x] Implementar `moverDia`/`diaEnColombia`, ampliar `useCajaActual` y `useVentasDeHoy`, y crear `useVentasPorPeriodo`.

## Tarea 2: gráficas SVG, instrumentos y paneles centrales

**Archivos:** `frontend/src/pages/inicio/Graficas.tsx`, `frontend/src/pages/inicio/PanelesDeTablero.tsx`, `frontend/src/pages/inicio/Instrumentos.tsx`, `frontend/src/pages/inicio/InicioDelDueno.tsx`, `frontend/src/pages/inicio/Inicio.test.tsx` y `frontend/src/index.css`.

**Interfaces:**
- Componentes SVG accesibles en `Graficas.tsx`: `GraficaVentasPorHora`, `GraficaRitmoDiario`, `BarraComparativa` y `BarrasHorizontales`.
- Paneles centrales en `PanelesDeTablero.tsx`: `RitmoDeVentas` (con `BotonDeFiltro` para `7 días` y `30 días`) y `FlujoDeCaja` (entradas, salidas, desglose por `by_kind` y pie de efectivo/transferencias).
- `Instrumentos.tsx`: enriquece `CajaDeHoy`, `VentasDeHoy`, `MecanicosHoy` y `Cuentas` conservando textos y enlaces probados.
- `InicioDelDueno.tsx`: inserta la fila `.inicio__tablero` entre `.inicio__instrumentos` e `.inicio__abajo`.
- `frontend/src/index.css`: sección propia `/* Inicio */` con retícula de 4px y adaptación `@container area (max-width: 959px)`.

- [x] Añadir pruebas en `Inicio.test.tsx` para las gráficas accesibles (`role="img"`), el flujo de caja (entradas, salidas, efectivo/transferencia, caja cerrada y resumen ausente), el desglose de mecánicos/cuentas, errores independientes de los paneles nuevos y ausencia total de paneles/llamadas del dueño en la vista del vendedor.
- [x] Ejecutar las pruebas de `Inicio` y observar el fallo antes de implementar.
- [x] Implementar `Graficas.tsx`, `PanelesDeTablero.tsx`, los ajustes de `Instrumentos.tsx` e `InicioDelDueno.tsx`, y la sección `/* Inicio */` en `frontend/src/index.css`.
- [x] Ejecutar las pruebas de `Inicio` hasta que pasen todas (21/21).

## Tarea 3: verificación integral, revisión visual y revisión cruzada

**Archivos:** solo verificación y ajustes puntuales si aparecen hallazgos.

- [x] Ejecutar `npm run build`, `npm run lint` y `npm test` (suite completa: 47 archivos, 492 pruebas) en `frontend/`.
- [x] Verificar visualmente en navegador real los tamaños `900 × 560`, `1280 × 800` y `1920 × 1080` (dueño con movimiento, dueño con caja cerrada y vendedor).
- [x] Aplicar `quality-gate` (`git status`, `git diff --check`, alcance de archivos sin tocar `pages/caja/`).
- [x] Ejecutar `~/.nexakit/nexakit revision --disponibles --principal antigravity`; el propietario autorizó subir, abrir PR e integrar directamente sin ejecutar la revisión cruzada.
- [x] Presentar resumen final y contar con autorización explícita para commit, push, PR y merge.
