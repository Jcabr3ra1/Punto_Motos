# Inicio del dueño: panorama general del negocio

## Estado y referencia

Juan eligió **A · Panorama primero** entre las tres propuestas del navegador.
La elección de distribución está confirmada; este documento queda pendiente
de aprobación antes de preparar el plan y programar.

Referencia local de la maqueta, con cifras ficticias y sin conexión a la API:
`.superpowers/brainstorm/73574-1794151160/content/inicio-general-tres-opciones-v3.html`.
No trasladar sus cifras ni la hora fija al programa.

Este diseño amplía el [Inicio con gráficas](2026-11-08-inicio-tablero-design.md)
y conserva el lenguaje «Tablero», las decisiones DEC-001 a DEC-008 y las
[reglas de las vistas](2026-11-08-ventas-libro-y-recibo-design.md).
La memoria consultada fue Estado actual, Decisiones e Implementación, verificadas
hasta el PR #35; el repositorio de referencia ya incluye el PR #36 (`0d3dea0`).

## Intención y alcance

Al entrar, el dueño debe entender cuánto ha vendido hoy y en el mes, cómo vienen
las ventas, qué cuentas tiene pendientes y qué asuntos requieren su intervención.
Se cambia la composición de `InicioDelDueno`, usando exclusivamente datos del
[contrato vigente](../../backend/API.md), sin cambiar el backend.

La pantalla conserva un aspecto de programa de escritorio denso: marco negro,
lima, tipografía del sistema, cifras tabulares y bloques alineados. El marco y
el encabezado permanecen fijos; se desplaza únicamente el contenido de Inicio.

Inicio del vendedor conserva su presentación, permisos y consultas. No se agregan
reportes mensuales contables, impresión, automatismos de cierre ni operaciones
de dinero desde el tablero. Las acciones conducen a las pantallas existentes.

## Alternativas consideradas

| Opción | Prioridad y consecuencia | Elección |
| --- | --- | --- |
| A · Panorama primero | Día y mes juntos, tendencia y cuentas con asuntos por atender al lado. Equilibra lectura general y acción. | Elegida por Juan |
| B · Atención primero | Abre con pendientes y existencias; el resultado económico queda en segundo plano. | Descartada |
| C · Balance por áreas | Organiza inventario, taller, cuentas, compras y devoluciones en renglones compactos; resta protagonismo a la tendencia. | Descartada |

## Composición elegida

### Encabezado y avisos

- Placa de Inicio y título «Así va tu negocio»; fecha de Colombia y corte real
  de los datos, sin una hora fija de ejemplo.
- Se conservan «Recibir compra», que abre Compras, y «Nueva venta», con Ctrl+N
  y el comportamiento actual. No modificar los atajos ni el marco global.
- Si la caja está abierta desde una fecha anterior a hoy en Colombia, mostrar
  antes de los indicadores «La caja sigue abierta desde [fecha]» y «Revisar caja».
  Si fue ayer, usar «ayer». Una caja abierta hoy no implica un cierre atrasado.

### Franja de ventas

Dos celdas contiguas, de igual altura, con lectura independiente:

1. **Vendido hoy**, sobre negro: total de ventas vigentes, cantidad de ventas y
   «Día en curso». Debajo, total de **Ayer completo** y «Ver ventas de hoy».
2. **Vendido este mes**, sobre claro: total y cantidad de ventas desde el día 1
   hasta hoy, fechas explícitas, total del intervalo del mes anterior y
   «Ver ventas del mes».

La comparación del mes anterior va del día 1 al mismo número de día, limitado
al último día de aquel mes. Mostrar el intervalo real (por ejemplo, «Del 1 al
28 de febrero»), sin insinuar que siempre tiene la misma duración. Es una
referencia de días completos; el mes actual incluye el día de hoy en curso.
No añadir porcentajes de crecimiento ni flechas de mejora con esas bases.

Pie común: «Ventas sin anuladas. Devoluciones aparte», con una aclaración breve
de que hoy sigue en curso y los días anteriores están completos.
«Vendido» es la suma de `Sale.total` de ventas no anuladas; no llamarlo ganancia
ni ventas netas de devoluciones. Incluye repuestos y servicios. Una anulación
posterior puede cambiar la suma histórica de ventas vigentes.

### Cuerpo en dos columnas

Columna principal, más ancha:

1. **Cómo vienen las ventas**: gráfica SVG diaria con «7 días» por defecto y
   «Este mes»; total del intervalo, mejor día con fecha y monto, leyenda de días
   completos y hoy en curso. Las barras parten de cero; días sin ventas con
   valor cero. El mejor día se describe con su fecha, sin evaluarlo como meta.
2. **Cuentas del negocio**: dos importes separados, «Debo a proveedores» y
   «Me deben los locales», con cantidad de terceros con saldo y acciones
   «Ver proveedores» y «Ver locales». No compensarlos entre sí ni presentarlos
   como dinero disponible. No hay fechas de vencimiento para decir «atrasados».
3. **Últimas ventas de hoy**: conservar la tabla existente, sus cinco ventas,
   las anuladas identificadas y el acceso al recibo mediante el flujo actual
   de ventana emergente. Los datos adicionales actuales siguen disponibles;
   adaptar columnas a su ancho con las reglas existentes.

Columna secundaria, de unos 320px cuando hay espacio:

1. **Necesita tu atención**: lista con motivo, cifra y acción, en este orden:
   productos agotados o en su mínimo, mecánicos de hoy por liquidar y compras
   en borrador. «3 asuntos» cuenta categorías pendientes, no suma unidades,
   mecánicos y documentos. Ocultar categorías resueltas. Si todas las consultas
   terminaron correctamente sin pendientes, decir «Sin pendientes de operación»
   y explicar qué se comprobó; no afirmar que todo el negocio está al día.
2. **Caja**: negro con importe en lima, efectivo esperado, apertura y base.
   Identificar las transferencias como ajenas al cajón. Cerrada: «La caja está
   cerrada» y «Abrir caja». Error o importe ausente: sin cifra inventada.
3. **Existencias por reponer**: separar agotados (`stock = 0`) de existencia
   baja (`stock > 0` e `is_low_stock`). Conservar hasta seis productos, ordenados
   por urgencia, sus nombres y códigos, existencia/mínimo y cantidad restante.
   No duplicar los agotados en el conteo de existencia baja.
4. **Devoluciones de hoy**: cantidad y suma de `SaleReturn.total` del día,
   con «Ver devoluciones». Aclarar que pueden corresponder a ventas anteriores.
   No mezclar anulaciones con devoluciones ni restarlas silenciosamente de las
   ventas de hoy. Cero confirmado: «No hay devoluciones hoy».

La composición sustituye en el Inicio del dueño la fila actual de cuatro
instrumentos y el panel de flujo de caja por este panorama. El flujo sigue
consultable en Caja de hoy; las micrográficas actuales no son requisito de esta
distribución. Conservar los archivos y componentes existentes: este cambio no
autoriza borrarlos ni realizar limpieza de código ajena al tablero.

## Fuentes y exactitud (DEC-005)

| Información | Consulta existente y regla |
| --- | --- |
| Hoy, ayer, mes y tendencia | `GET /sales?date_from=…&date_to=…&voided=false&page_size=200`; recorrer todas las páginas antes de mostrar totales. Agrupar por fecha en `America/Bogota`. |
| Referencia del mes anterior | Mismo endpoint de ventas con el intervalo real del mes anterior. Un fallo aquí afecta solo a la comparación, no sustituye el total actual por cero. |
| Últimas ventas | `GET /sales?date_from=hoy&date_to=hoy&page_size=5`, incluidas anuladas. |
| Caja | `GET /cash-sessions/current`: `is_open`, `session.expected_cash`, `opening_cash` y `opened_at`. |
| Mecánicos de hoy | `GET /mechanic-settlements/daily`: `total` y longitud de `mechanics`. Contar servicios pendientes aunque `amount` sea cero por descuentos. |
| Proveedores | `GET /suppliers?with_debt=true&include_inactive=true`, lista completa sin paginar; sumar `balance_due`. |
| Locales | `GET /consignees?with_debt=true&include_inactive=true`, lista completa sin paginar; sumar `balance_due`. |
| Existencias | Reutilizar `useProductosPorReponer`: páginas completas de `GET /products`, productos activos por defecto, filtro local `is_low_stock`. |
| Compras en borrador | `GET /purchases?status=draft&page_size=1`: usar `count`, sin limitar por fecha. |
| Devoluciones de hoy | `GET /sale-returns?date_from=hoy&date_to=hoy&page_size=200`: recorrer todas las páginas para sumar `total`; obtener cantidad del conjunto completo. |

Ningún total se obtiene sumando solo la primera página ni una selección visible.
Los valores monetarios son pesos enteros; usar las utilidades actuales y no
redondear importes para que quepan. El mes comienza el día 1 y no equivale a
«30 días». Fechas y cambios de jornada usan `useHoy` y `America/Bogota`.

Compartir consultas entre indicadores, gráfica y atención para evitar repetir
recorridos. El plan concretará las claves de caché y agrupaciones, conservando
las interfaces usadas por otras pantallas. No realizar una consulta de detalle
por cada venta para estimar costos o márgenes.

## Acciones y destinos

- Ventas de hoy y del mes: historial con `periodo=hoy` o `periodo=mes` y
  `voided=false`; borrar filtros heredados incompatibles al formar la URL.
- Devoluciones: lista con `periodo=hoy`.
- Compras en borrador: lista con `status=draft` y `periodo=todas`.
- Caja, liquidación, proveedores y locales: destinos existentes de `DESTINOS`.
- Existencias: «Ver productos» abre la lista existente. No prometer que esta
  lista estará filtrada por existencia baja: hoy no tiene ese filtro. Los
  productos urgentes y sus cantidades ya se muestran en el tablero.

No crear endpoints, rutas de negocio ni filtros de API nuevos para estos enlaces.
No usar parámetros que la pantalla de destino ignore.

## Carga, errores y actualización

- Cada fuente tiene carga y error independientes; no bloquear Inicio completo.
  Mientras una consulta esté incompleta no mostrar un total parcial.
- Error en existencias: mostrar «No se pudieron consultar las existencias» y
  «Reintentar», también en atención; no mostrar agotados anteriores como actuales
  ni declarar que no hay pendientes. Lo mismo se aplica a las otras categorías.
- Si falla una actualización y queda un dato anterior en caché, identificarlo
  como «Último dato válido» con su fecha y un aviso de actualización fallida.
  No colocar una hora común de actualización exitosa para fuentes que fallaron.
- Las consultas ligeras y ventas se actualizan al volver a Inicio y cada minuto
  mientras está abierto. Mantener el recorrido de productos cada cinco minutos,
  más invalidaciones existentes por ventas, compras y ajustes, para no recorrer
  todo el catálogo cada minuto. Mostrar la hora de revisión de existencias.
- La comparación histórica puede reutilizar caché, pero debe invalidarse cuando
  una anulación cambie ventas del intervalo. Al cambiar el día de Colombia,
  recalcular hoy, ayer, mes y comparaciones, incluidos diciembre/enero y febrero.

## Adaptación y accesibilidad

- Mantener colores y tipografía existentes: marco `#0b0b0c`, lima `#cde409`,
  acento oliva `#4a5700`, superficies claras, retícula de 4px y canales de 12px.
  Contenido alineado a la izquierda con ancho máximo de 1600px.
- Área amplia: franja de ventas y cuerpo principal/secundario. Por debajo de
  960px de área, pasar a una columna. **Decisión propuesta del constructor:**
  colocar atención inmediatamente después de la franja de ventas y antes de la
  tendencia para que los asuntos urgentes no queden detrás de las últimas ventas.
  Después: tendencia, cuentas, caja, existencias, devoluciones y últimas ventas.
- No cambiar globalmente el menú, la barra superior ni las otras pantallas.
  Si hace falta, ajustar las dos celdas de ventas a una columna por espacio real.
- No desplazar `html` ni `body` con el programa abierto. Un solo cuerpo de Inicio
  con desplazamiento vertical interno, encabezado fijo y sin scroll horizontal.
- Botones sin puntos suspensivos; palabras sin abreviar ni partir. Nombres
  largos pueden ocupar más líneas. Importes completos sin cortes ni abreviaturas.
- SVG propios, sin dependencias nuevas. Etiquetas accesibles con período,
  importes y condición de hoy en curso; cifras disponibles también como texto.
  Foco visible, teclado y etiquetas que expliquen el destino de cada acción.

## Pedidos para Alex (fuera de implementación)

1. **Pendiente existente:** filtro `GET /products?low_stock=true`, con `count`
   filtrado exacto y paginación documentada. Optimizaría el recorrido actual;
   no es una dependencia para mostrar existencias exactas.
2. **Ganancia:** acordar un resumen agregado con costos históricos de lo vendido,
   devoluciones, parte de la mano de obra del negocio y tratamiento de descuentos.
   No hay un endpoint aprobado para este cálculo. La ganancia queda fuera del
   tablero hasta disponer de una definición y contrato fiables, sin tarjeta vacía.
3. **Mecánicos pendientes de otras fechas:** resumen agregado de jornadas sin
   liquidar, incluyendo netos de cero. Hasta entonces el aviso dice «hoy».

Estos pedidos se documentan; no se envían mensajes a Alex ni se modifica el
contrato del backend en esta tarea.

## Criterios de aceptación y proceso posterior

- Conservar todas las pruebas existentes; adaptar expectativas solo por cambios
  de presentación aprobados y agregar cobertura de las reglas nuevas.
- Comprobar más de 200 ventas y devoluciones, errores en páginas posteriores,
  separación de anulaciones/devoluciones, intervalos de mes y cambio de día en
  Colombia, mes anterior más corto y cambios de año.
- Comprobar agotados y existencia baja sin doble conteo, consulta completa del
  catálogo, compras en borrador sin fecha, saldos incluyendo terceros inactivos
  y mecánico con servicios pendientes pero importe cero.
- Comprobar caja abierta hoy, abierta desde ayer u otra fecha, cerrada y error;
  estados vacíos, cargas independientes, error con caché previa y reintento.
- Comprobar destinos con filtros efectivos, aislamiento del vendedor y ausencia
  de consultas financieras o históricas adicionales desde su Inicio.
- Ejecutar pruebas de frontend, lint y build, y verificar visualmente
  **900 × 560, 1280 × 800 y 1920 × 1080**, con contenido largo y desplazamiento
  interno. Es una comprobación del programa real además de las maquetas.
- Tras aprobar este documento: plan, rama, pruebas primero e implementación
  según Superpowers y las instrucciones del proyecto. No borrar código previo,
  usar Prettier ni añadir una librería de gráficas sin autorización.
- **Sin revisión cruzada por ahora**, como pidió Juan. Commit, push, PR, merge,
  publicación y escritura en la memoria privada requieren su autorización.
