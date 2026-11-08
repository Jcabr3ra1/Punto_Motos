# Caja de hoy: diario y cajón

## Diseño elegido

Juan eligió la opción **A · Diario + cajón** en las tres maquetas del navegador.
Se aplica el lenguaje aprobado de Vender y las reglas de
[orden, alineación y adaptación](2026-11-07-rediseno-secciones-y-vistas-design.md).
La maqueta de referencia está en la carpeta local sin versionar
`.superpowers/brainstorm/38465-1794114267/content/caja-tres-propuestas.html`.

El objetivo es comprender cuánto efectivo debería haber, qué entró, qué salió
y qué falta para cerrar, conservando todas las operaciones actuales.

## Distribución y comportamiento

- Encabezado común con estado y datos reales de apertura.
- Franja de cuatro indicadores: efectivo inicial, entradas en efectivo,
  salidas en efectivo y transferencias netas.
- Diario de movimientos a la izquierda, con cabecera fija, desplazamiento
  interno, signos y cifras a la derecha. A petición de Juan, páginas de diez
  movimientos y pie fijo con «Atrás» y «Siguiente», siempre visible incluso
  con una sola página; los botones sin destino quedan desactivados. Solo se
  aplica a Caja de hoy, usando el `page_size` ya documentado por la API.
- Cajón negro a la derecha: efectivo esperado en lima, desglose de la base
  más entradas menos salidas, transferencias separadas y acceso al resumen.
  El pie explica que falta contar y ofrece registrar gasto o retiro y cerrar.
- El resumen por tipo usa `Ficha`; en área angosta usa su `PanelLateral`.
  En área ancha ocupa temporalmente el lugar del cajón y puede cerrarse para volver.
- Apertura, gasto/retiro y cierre conservan campos, validación, peticiones,
  mensajes y vista previa actuales. Cuando la caja está cerrada se presenta
  la apertura con el efectivo sugerido y un estado vacío apropiado.

## Datos

Solo se usan los endpoints existentes de [Caja](../../backend/API.md#caja).
`expected_cash` es la autoridad del efectivo esperado. Las entradas y salidas
en efectivo se suman por signo desde `summary.by_kind`, que cubre la sesión
completa. Las transferencias usan `summary.transfer_total` y no se mezclan con
el cajón. No se suman las páginas de movimientos ni se inventan pendientes de
ventas, taller o proveedores. Mientras no se cuente no se afirma que la caja
cuadra ni que falta o sobra dinero. Si falta el resumen, se muestra que no
está disponible; no se reemplaza por ceros.

## Adaptación y piezas

Reutilizar `EncabezadoDePantalla`, `FranjaDeIndicadores`, `Ficha`, `EstadoVacio`
y `PanelLateral`. Retícula de 4px con tokens existentes, canales de 12px,
controles de 32px, números tabulares y ancho máximo de 1600px alineado a la
izquierda. No añadir dependencias ni usar Prettier.

Juan ajustó la regla de textos para esta pantalla: «Cerrar caja» se muestra
completo y sin puntos suspensivos. Los nombres, detalles y rótulos no se
recortan con puntos; ocupan las líneas necesarias. Los importes de la tabla
se muestran completos y, si no caben, se desplaza su contenedor.

Comprobar 900 × 560, 1280 × 800 y 1920 × 1080. Por debajo de 960px de área,
indicadores en 2 × 2, ficha en panel lateral y columnas secundarias ocultas.
El cajón se compacta omitiendo el desglose repetido en los indicadores; el
esperado y las acciones siguen disponibles. El encabezado, indicadores y pie
de acciones permanecen a la vista y el diario se desplaza dentro de su tabla.

## Alternativas consideradas

- **A, elegida:** prioriza el diario y reúne el efectivo y el cierre en la
  registradora derecha, como Vender. Consultar el resumen requiere abrirlo.
- **B, mostrador horizontal:** balance en una banda negra y dos tablas debajo;
  hace más directa la comparación por tipo, pero separa balance y cierre.
- **C, libro de caja:** balance y resumen a la izquierda, diario a la derecha;
  favorece la conciliación, pero da menos protagonismo al cajón y su cierre.

## Alcance y verificación

Conservar las pruebas existentes; cambiar solo selectores cuando la nueva
distribución lo exija. Añadir pruebas del resumen completo, las transferencias,
resumen ausente, estados vacíos, paginación y ficha angosta. Ejecutar build,
lint y toda la suite frontend. Antes de la revisión adicional, quality-gate;
la revisión se ejecuta según `revision-cruzada`, sin subagentes. Sin commits,
push, PR, publicación ni escritura de memoria sin autorización.
