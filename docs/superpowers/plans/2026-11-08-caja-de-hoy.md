# Plan de implementación: Caja de hoy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. No usar subagentes; respetar el modo de ejecución que confirme Juan.

**Objetivo:** implementar A · Diario + cajón preservando las operaciones de Caja.

**Arquitectura:** componer las piezas existentes alrededor de la sesión actual.
Separar el balance del diario paginado; mantener los formularios y sus
mutaciones. Limitar los estilos a Caja de hoy para conservar el historial.

**Tecnologías:** React, TypeScript, TanStack Query, CSS, Vitest y Testing Library.

**Diseño:** [Caja de hoy: diario y cajón](../specs/2026-11-08-caja-de-hoy-design.md).

## Restricciones globales

- Rama `feat/rediseno-caja-de-hoy`, creada desde main actualizado con `git pull`.
- Retícula de 4px; tokens `--esp-1` a `--esp-8`; canales de 12px.
- Ventanas 900 × 560, 1280 × 800 y 1920 × 1080; corte de área en 960px.
- Reusar piezas existentes; ninguna dependencia ni endpoint nuevo; sin Prettier.
- Pruebas primero; conservar la intención de todas las pruebas existentes.
- Sin commit, push, PR, publicación ni actualización de memoria sin autorización.

## Foco de revisión

1. Movimientos paginados: los indicadores deben reflejar la sesión completa.
2. Pagos por transferencia: no modifican entradas o salidas en efectivo.
3. Resumen ausente frente a resumen vacío: distinguir desconocido de cero.
4. Ventana mínima y textos/importes largos: conservar esperado y acciones sin solapamientos.
5. Abrir y cerrar detalles: conservar foco, teclado y formularios de las operaciones.

## Tarea 1: balance y operaciones

**Archivos:** `frontend/src/pages/caja/CajaDeHoy.tsx`,
`frontend/src/pages/caja/ResumenDeCaja.tsx` y
`frontend/src/pages/caja/Caja.test.tsx`.

**Interfaces:** consumir `CashSession`, `CurrentCash`, `summary.by_kind`,
`summary.transfer_total` y los endpoints actuales. Conservar `CifrasDeCaja`
para el historial. La página compone indicadores, cajón y resumen; los
formularios mantienen sus entradas y salidas actuales.

- [x] Ejecutar pruebas de referencia: 14 pruebas de Caja y vistas relacionadas pasan.
- [x] Añadir pruebas que exijan indicadores exactos para una sesión con varias
  entradas/salidas y una página parcial; verificar esperado desde `expected_cash`.
- [x] Probar transferencias sin efectivo, resumen ausente, resumen vacío y
  navegación del resumen mediante ficha/panel, incluido cierre con Esc.
- [x] Ejecutar las pruebas nuevas y observar su fallo antes de implementar.
- [x] Implementar la composición A y los cálculos desde el resumen completo.
  Mantener formularios, invalidaciones, permisos y contratos.
- [x] Ajustar únicamente los selectores existentes que deban abrir el resumen.
- [x] Ejecutar las pruebas específicas hasta que pasen todas.

## Tarea 2: diario y adaptación

**Archivos:** `frontend/src/pages/caja/ResumenDeCaja.tsx`,
`frontend/src/pages/caja/Caja.test.tsx` y `frontend/src/index.css`.

**Interfaces:** conservar `MovimientosDeCaja({ cajaId: number })`, su consulta
paginada y los datos originales. Los estilos nuevos se limitan a `.caja-hoy`.

- [x] Añadir pruebas de estado vacío, error con reintento y avance de página
  conservando los indicadores del resumen, y observar el fallo correspondiente.
- [x] Dar al diario su contenedor con título fijo y paginación visible; mostrar
  estados de carga/error/vacío con piezas existentes.
- [x] Implementar el cajón negro, números alineados, columnas secundarias,
  indicadores 2 × 2 y resumen con `Ficha`/`PanelLateral` según el ancho del área.
- [x] Comprobar en navegador los tres tamaños, con importes y motivos largos;
  verificar teclado y que el desplazamiento quede dentro de las tablas.
- [x] Ejecutar `npm run build`, `npm run lint` y `npm test` en `frontend/`.
- [x] Aplicar quality-gate, revisar diff y `git diff --check`.
- [x] Consultar revisores disponibles con la orden estable de nexakit e intentar
  la revisión con Claude elegida en la sesión. Si la certificación bloquea la
  revisión, declararlo; Juan autorizó continuar con la integración sin ese informe.
- [x] Informar resultado, pruebas y límites, respetando el alcance autorizado.

## Ajustes e integración autorizados

Juan pidió completar el pie de la tabla con «Atrás» y «Siguiente», y mostrar
«Cerrar caja» y las palabras completas sin puntos suspensivos. Autorizó commit,
push, PR y merge hacia `main`; esta autorización no incluye una Release ni
escrituras de memoria.

- [x] Probar avance y retroceso, páginas de diez movimientos y botones
  desactivados en la única página; conservar el comportamiento del historial.
- [x] Comprobar los textos completos y el cierre visible en los tres tamaños.
- [x] Ejecutar build, lint, suite completa y quality-gate sobre el resultado.
- [ ] Crear el commit en español, subir la rama y abrir el PR.
- [ ] Comprobar el PR y sus verificaciones, fusionarlo y actualizar main local.
