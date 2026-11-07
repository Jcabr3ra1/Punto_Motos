# Rediseño: menú por secciones, acceso, Inicio y vistas

## Intención

El marco «Tablero» (PR #23) dejó una columna de iconos con los módulos y, al lado, una subbarra con las pantallas del módulo abierto. A Juan esa subbarra no lo convence: las pantallas quedan separadas de su sección y hay demasiados botones a la vista. Además, Configuración mezcla cosas del programa con cosas del trabajo diario (tipos, marcas y motos; tipos de servicio; mecánicos) e Inicio tiene el botón de actualizar el programa.

Juan también siente que las vistas siguen siendo genéricas: «no hay vida, no hay arte, no hay inspiración, parecen plantillas». Quiere algo muy estructurado, con una experiencia de usuario muy buena, **todo alineado y sin textos mal puestos**, y que se adapte bien a cualquier tamaño de ventana. El inicio de sesión debe ser una ventana pequeña, e Inicio está casi vacío.

Este documento cubre cinco partes, en este orden de entrega:

1. **Navegación:** el menú por secciones y dónde vive cada pantalla.
2. **Logo** sin fondo.
3. **Acceso:** el inicio de sesión en una ventana pequeña, y el asistente y la pantalla de conexión con el mismo marco.
4. **Inicio** con el resumen del día.
5. **Vistas:** el mismo lenguaje en todas las pantallas.

Maquetas aprobadas (carpeta local sin versionar, `.superpowers/brainstorm/73643-1794094393/content/`):

- `menu.html`, opción **B · Secciones que se despliegan**.
- `login.html`, opción **A · Piñón en movimiento**, **sin** la versión y **sin** «¿Olvidaste la contraseña?».
- `inicio.html`: vista del dueño y del vendedor.
- `vistas.html`: Productos como modelo de todas las pantallas.

## Objetivos

Navegación (parte 1):

1. Un solo menú lateral negro, anclado a la izquierda, en lugar de la columna de iconos más la subbarra.
2. Cada pantalla cuelga de su sección. Solo la sección actual está desplegada; las demás se ven como una fila con su icono y una flecha.
3. Configuración queda solo con lo del programa, al pie del menú y separada del trabajo diario.
4. El botón de actualizar el programa sale de Inicio y pasa a Configuración.
5. Se quitan las pestañas internas de las secciones (`SeccionConPestanas`), que repiten lo que ya muestra el menú.

Partes 2 a 5:

6. El logo sin el fondo negro pegado.
7. Inicio de sesión en una ventana pequeña con arte propio, que crece al entrar.
8. Inicio con el resumen del día para el dueño y una consulta rápida de precios para el vendedor.
9. Todas las pantallas con el mismo lenguaje: encabezado con placa, indicadores, filtros como botones, tablas con vida y ficha a la derecha.
10. Todo alineado a una retícula y adaptado a ventanas de 900 × 560 hasta pantallas grandes.

## Fuera de alcance

- Indicadores que el backend no entrega: «productos por reponer» (no hay filtro de poca existencia) y «valor del inventario» (no hay totales). Quedan fuera hasta que Alex los agregue.
- Publicar la versión de escritorio: se hace aparte, con `docs/PUBLICACION.md`, cuando Juan lo decida.
- «Cambiar mi clave» para cada usuario: el backend no tiene ese endpoint (solo `POST /users/{id}/set-password` para el dueño, que ya está en Usuarios). No se construye.
- Cambios en el backend o en el contrato de la API.

## Resultados que no se aceptan

- Un vendedor ve en el menú, en el buscador o por una ruta escrita a mano una pantalla del dueño.
- Se pierde la navegación con teclado o el foco visible en el menú.
- El menú parece de página web: tarjeta flotante, esquinas grandes, sombras, scroll de toda la ventana.
- Fallan las pruebas existentes o se quitan pruebas para que pasen (las que prueban la columna o la subbarra se reescriben para el menú nuevo).
- Alguna pantalla queda sin entrada en el menú o en dos secciones a la vez.
- Hay algo desalineado: textos que no comparten línea base, bloques de una misma fila con alturas distintas, números sin alinear a la derecha, márgenes que no siguen la retícula, textos cortados o encimados.
- Un indicador muestra una cifra que no es exacta, por ejemplo la suma de solo la primera página de un listado.
- Algo se rompe o se encima en una ventana de 900 × 560, o queda perdido en el centro de una pantalla de 1920 × 1080.

## Las secciones

Orden de arriba abajo. Entre paréntesis, quién la ve. La ruta nueva va a la derecha; las pantallas que cambian de ruta están marcadas.

| Sección | Pantallas | Ruta |
| --- | --- | --- |
| **Inicio** (todos) | — enlace directo, sin desplegar | `/` |
| **Mostrador** (todos) | Vender | `/venta/vender` |
| | Ventas | `/venta/historial` |
| | Devoluciones | `/venta/devoluciones` |
| **Inventario** (todos) | Productos | `/inventario/productos` *(antes `/productos`)* |
| | Movimientos | `/inventario/movimientos` |
| | Inventario inicial (dueño, solo con el conteo abierto) | `/inventario/inicial` *(antes `/inventario-inicial`)* |
| | Tipos, marcas y motos (dueño) | `/inventario/catalogo` *(antes `/configuracion/catalogo`)* |
| **Taller** (dueño) | Liquidación del día | `/taller/liquidacion` |
| | Historial de liquidaciones | `/taller/historial` |
| | Mecánicos | `/taller/mecanicos` *(antes `/configuracion/mecanicos`)* |
| | Tipos de servicio | `/taller/servicios` *(antes `/configuracion/servicios`)* |
| **Compras** (dueño) | Compras, Proveedores, Abonos | sin cambios |
| **Caja** (dueño) | Caja de hoy, Cajas anteriores | sin cambios |
| **Consignación** (dueño) | Locales, Entregas, Reportes, Pagos | sin cambios |
| *separador* | | |
| **Configuración** (todos) | Datos del negocio (todos) | `/configuracion/negocio` |
| | Usuarios (dueño) | `/configuracion/usuarios` |
| | Actualizar programa (dueño) | `/configuracion/actualizaciones` *(nueva)* |

- «Venta» pasa a llamarse **Mostrador** en el menú, el buscador y la barra superior. La ruta `/venta` se mantiene.
- La regla de que la sección es el comienzo de la ruta se conserva (`/inventario/...` es Inventario), así `moduloDe` y `ubicacionDe` siguen sirviendo.
- Las rutas viejas redirigen a las nuevas con `Navigate replace`, por si algún enlace interno o estado guardado las usa *(decisión del constructor: se puede omitir si no hay ninguna referencia)*.
- Una sección sin pantallas visibles para el rol no aparece. Inventario para el vendedor muestra solo Productos y Movimientos.
- Productos tiene hoy su propia ruta sin sección; al moverla, Inventario necesita su ruta índice `/inventario` que redirige a Productos.

## Cómo se comporta el menú

**Expandido (normal), unos 228px de ancho:**

- Arriba: el logo y «Punto Moto» con un subtítulo pequeño. Abajo: Configuración, separada por una línea, y debajo la persona conectada (iniciales y rol). Salir sigue en la barra superior.
- Cada sección es una fila con icono, nombre y una flecha `›`; la abierta muestra `⌄`.
- La sección de la pantalla actual siempre está desplegada. Sus pantallas cuelgan debajo, con sangría y una línea vertical fina que las une a la sección.
- La pantalla actual: fondo un poco más claro, texto blanco y una barra lima de 3px a la izquierda. El icono de su sección también va en lima.
- **Al pulsar una sección cerrada,** se despliega, la que estaba abierta se pliega y se va a su primera pantalla visible para el rol. Una sola sección abierta a la vez.
- **Al pulsar la sección ya abierta,** no pasa nada (no se pliega: la sección de la pantalla actual siempre se ve).
- Las pantallas de la sección no llevan icono propio; las secciones sí.
- Si el menú no cabe en alto (ventana de 560px con Consignación abierta), la parte central se desplaza; logo, Configuración y persona quedan fijos.
- Sin animación al desplegar, o una de menos de 150ms. Con `prefers-reduced-motion`, ninguna.

**Recogido (Ctrl+B o el botón del pie), unos 56px:**

- Solo los iconos de las secciones, con la actual marcada en lima.
- Al pasar el ratón o llevar el foco con el teclado a un icono, sale a su derecha una ventanita negra con el nombre de la sección y sus pantallas, para ir directo. Se cierra al salir, con Esc o al elegir.
- El estado recogido se recuerda como hoy (`useMenuRecogido`).
- Por debajo de 1000px de ancho de ventana el menú arranca recogido *(decisión del constructor, alineado con el tamaño mínimo de 900 × 560)*.

**Teclado y lectores de pantalla:**

- El menú es un `nav` con `aria-label="Principal"`. Cada sección es un botón con `aria-expanded`; sus pantallas son enlaces con `aria-current="page"` en la actual.
- Tab recorre secciones y pantallas en orden; Enter o Espacio abre la sección. Las flechas arriba y abajo son opcionales *(decisión del constructor)*.
- Ctrl+K (buscador) y Ctrl+B (recoger) siguen igual.

## Lo que cambia en las pantallas

- **Dónde estás:** la barra superior ya muestra «Sección › Pantalla». Se mantiene así y no se repite encima del título *(decisión de Claude: en la conversación se dijo «encima del título»; la barra superior cumple ese papel sin duplicarlo)*.
- `SeccionConPestanas` desaparece. Cada pantalla pone su propio `h1`. Compras y Configuración, que la usaban, dejan de mostrar el título de la sección encima.
- `Configuracion.tsx` queda como marco de sus rutas sin pestañas.
- **Inicio** deja de mostrar `Actualizaciones`. Por ahora queda con lo demás tal cual; su rediseño es el paso siguiente.
- **Actualizar programa** es una pantalla nueva que muestra el componente `Actualizaciones` existente con su título. Fuera de Tauri (navegador de desarrollo) muestra un aviso de que solo funciona en el programa instalado, como hoy.
- El buscador (Ctrl+K) y sus pruebas toman las secciones nuevas: busca «mecánicos» y lo muestra dentro de Taller.

## Piezas del código afectadas

- `navegacion/destinos.ts`: rutas nuevas, etiqueta «Mostrador», sección Inventario con sus pantallas, Taller con Mecánicos y Tipos de servicio, Configuración con Actualizar programa. Sigue siendo la única fuente de verdad.
- `estructura/`: un componente de menú nuevo reemplaza `ColumnaDeIconos` y `PanelContextual`; `Estructura.tsx` lo usa.
- `Rutas.tsx`: rutas movidas, redirecciones de las viejas e índice de Inventario.
- `components/SeccionConPestanas.tsx`: se elimina y sus usos se reemplazan.
- `pages/Inicio.tsx`: quita `Actualizaciones`.
- `index.css`: estilos del menú nuevo con los tokens del marco (`--marco`, `--marco-seleccion`, `--marco-texto`, `--color-marca`); se quitan los de la columna y el panel contextual.
- Las carpetas de las páginas (`pages/configuracion/catalogo`, `pages/configuracion/taller`) pueden quedarse donde están o moverse junto a su sección *(decisión del constructor; mover es más ordenado y no cambia comportamiento)*.

## Reglas de orden y alineación (todas las partes)

Son obligatorias. Juan pidió «todo muy perfecto y sin errores».

- **Retícula de 4px.** Todos los espacios salen de esta escala: 4, 8, 12, 16, 20, 24 y 32, definida como tokens en `:root` (`--esp-1` a `--esp-8`). Nada de valores sueltos como 7px o 13px en márgenes y rellenos.
- **Un solo canal entre bloques:** 12px entre tarjetas, paneles e indicadores, y 16px de relleno en el área de trabajo (18px en las maquetas, se redondea a la escala). Cada tarjeta tiene un relleno interior de 12px arriba y abajo y 16px a los lados.
- **Misma altura en cada fila:** los bloques de una fila usan `display: grid` y se estiran. Sus pies, por ejemplo «Ver la caja →», quedan a la misma altura con `margin-top: auto`.
- **Números:** siempre `font-variant-numeric: tabular-nums` y alineados a la derecha en tablas y listas. El dinero lleva el formato de `formatearPesos`.
- **Escala de texto fija:**
  - título de pantalla: 20px, peso 650;
  - cifra de indicador: 24px;
  - texto normal: 13 a 14px;
  - texto secundario: 12 a 12,5px;
  - rótulos en mayúsculas: 11,5px con espaciado de 0,07em;
  - nada por debajo de 11px.
- **Altura de los controles:** 32px para botones, campos y botones de filtro de una línea, y 28px para las filas de un submenú. Iconos de 16px en botones y de 18px en el menú.
- **Textos largos:** se cortan con puntos suspensivos (`text-overflow: ellipsis`) y el texto completo en `title`; nunca se salen ni se encima un texto sobre otro. Los nombres de producto pueden ocupar dos líneas en la ficha.
- **Contraste AA** en todo el texto, incluido el atenuado.
- **Contenido ancho:** en pantallas grandes, el área de trabajo no pasa de 1600px de ancho y queda alineada a la izquierda, junto al menú, no centrada.

## Adaptación al tamaño de la ventana

La ventana va de **900 × 560** (mínimo) a pantallas grandes. Al achicarse nada se apila como en un celular: se reacomoda.

| Ancho del área de trabajo | Comportamiento |
| --- | --- |
| ≥ 1100px | Diseño completo: 4 instrumentos en fila, la ficha al lado de la tabla (300px) y las columnas secundarias visibles. |
| 900–1099px (incluye 900 × 560 con el menú recogido) | Instrumentos e indicadores en una cuadrícula de 2 × 2. La ficha deja de ir al lado y se abre como el `PanelLateral` existente sobre la lista. Las columnas marcadas como secundarias se ocultan. Las acciones del encabezado pasan bajo el título si no caben. |
| Menos de 1000px de ventana | El menú arranca recogido (ya existe en `useMenuRecogido`). |

- Las tablas se desplazan dentro de su contenedor, nunca la ventana. El encabezado de la tabla queda fijo (`position: sticky`).
- Se usan consultas de contenedor (`@container`) sobre el área de trabajo, no de ventana, porque el ancho real depende de si el menú está recogido.
- Con poca altura (560px), el encabezado, los indicadores y los filtros no se desplazan: solo se desplaza la tabla.

## Logo (parte 2)

- `frontend/public/logo.png` se reemplaza por una versión con **fondo transparente** del mismo tamaño (480 × 469). Solo se vuelve transparente el negro **conectado al borde**: el interior oscuro del piñón se conserva para que se vea bien sobre fondos claros. Los bordes llevan un suavizado para que no quede un halo. Se genera con el método de la maqueta (`logo-transparente.png`) y se revisa sobre fondo negro, blanco y `#ecebe6`.
- Los iconos del instalador (`desktop/src-tauri/icons/`) no cambian.

## Acceso (parte 3)

**Ventana pequeña.** El programa abre en una ventana de **760 × 500**, centrada, que no se puede redimensionar ni maximizar. Al iniciar sesión, la ventana crece a **1280 × 800** (o al tamaño guardado, si el sistema lo recuerda), se centra, permite redimensionar y maximizar, y toma el mínimo de **900 × 560**. Al cerrar sesión, o si la sesión vence, vuelve a la ventana pequeña.

- En `tauri.conf.json`, la ventana `main` pasa a 760 × 500, con `resizable: false` y `maximizable: false`, sin `minWidth` ni `minHeight`.
- La capacidad `main` suma los permisos de ventana necesarios: `core:window:allow-set-size`, `allow-set-min-size`, `allow-set-resizable`, `allow-set-maximizable` y `allow-center`.
- El frontend cambia el tamaño con `@tauri-apps/api/window` en un solo lugar: un hook `useTamanoDeVentana(fase)` que reacciona a la fase de la sesión. Fuera de Tauri, en el navegador de desarrollo, no hace nada.
- Cambiar `desktop/` exige una versión nueva de escritorio para llegar al programa instalado (ver `AGENTS.md` y `docs/PUBLICACION.md`). Este cambio no publica nada.

**Diseño (maqueta A).** `MarcoDeAcceso` pasa a dos columnas:

- **Izquierda, arte sobre `--marco`:**
  - el logo transparente grande, cortado por la esquina superior izquierda;
  - cuatro líneas de velocidad, alternando lima y gris;
  - un degradado hacia negro en la parte baja;
  - abajo, el titular «Tienda y taller, *en un solo tablero.*», con la segunda línea en lima;
  - la frase «Ventas, inventario, caja y mecánicos del día, al alcance de la mano.»;
  - un punto de estado con «Conectado», «Conectando…» o «Sin conexión», según `/health`.
- **Sin versión** y **sin «¿Olvidaste la contraseña?»**.
- **Derecha, 330px sobre fondo claro, con filete lima de 3px a la izquierda:** el título, un subtítulo, los campos (Usuario y Contraseña, con botón para mostrar u ocultar la contraseña) y el botón lima «Entrar» con flecha. Si no cabe, la columna se desplaza.
- El **asistente del dueño** y la **pantalla de conexión** usan el mismo marco y el mismo arte. El asistente tiene más campos y su columna se desplaza.
- El arte de la izquierda es decorativo (`aria-hidden`). La única animación permitida son las líneas de velocidad que entran una vez, en menos de 400ms, y ninguna con `prefers-reduced-motion`.

## Inicio (parte 4)

**Dueño** (maqueta `inicio.html`, arriba):

- **Encabezado:** la placa, el saludo según la hora con el nombre, la fecha larga («Sábado 7 de noviembre · así va el día») y dos acciones: «Recibir compra», que lleva a la lista de Compras, y «Nueva venta» (lima, Ctrl+N).
- **Cuatro instrumentos** en una fila de igual altura:
  1. **Caja de hoy**, la única en negro: el efectivo esperado, la hora de apertura y la base, y el enlace «Ver la caja →». Si la caja está cerrada, dice que está cerrada y ofrece el botón «Abrir caja». Datos de `/cash-sessions/current`.
  2. **Ventas de hoy:**
     - cuántas son y por cuánto, sin contar las anuladas;
     - debajo, un gráfico de barras por hora, de 8 a. m. a 6 p. m., que se amplía si hay ventas fuera de ese horario; la hora actual va en oliva.
     - Datos de `/sales?date_from=hoy&date_to=hoy&voided=false&page_size=200`, recorriendo todas las páginas si hay más de 200.
  3. **Mecánicos hoy:** el total por pagar, cuántos mecánicos y cuántos servicios, con el enlace «Liquidar →». Datos de `/mechanic-settlements/daily`. Si no hay nada pendiente, dice «Nada por pagar hoy».
  4. **Cuentas:** «Debo a proveedores» (suma de `balance_due` de `/suppliers`, que no está paginado) y «Me deben los locales» (suma de `/consignees?with_debt=true`), con el enlace «Ver proveedores →».
- **Últimas ventas de hoy:** las 5 más recientes (`/sales?date_from=hoy&date_to=hoy&page_size=5`, incluidas las anuladas, que se ven tachadas). Columnas: recibo, hora, cliente o «Sin cliente», productos (con «+ taller» si tiene servicios), vendió y total. Cada fila abre la venta, y hay un enlace «Ver todas →».
- **«Ir a»:** Vender, Productos, Liquidación del día y Compras, cada una con su icono en placa y su descripción.

**Vendedor** (maqueta, abajo):

- **Encabezado:** el saludo y un subtítulo según la caja, «la caja está abierta, puedes vender» o «la caja está cerrada: pídele al dueño que la abra», con la acción «Nueva venta».
- **Consultar precio y existencia:** un campo sobre fondo negro que usa `/catalog/search` (desde 2 caracteres, hasta 8 resultados, con una pausa como la del buscador de Vender). Muestra nombre, moto y marca, precio y unidades, y no tiene acciones: solo consulta.
- **Ventas de hoy:** las de la tienda, no solo las suyas, porque la API no filtra por vendedor. Columnas: recibo, hora, cliente y total. Cada fila abre la venta.
- El vendedor no ve montos de caja, mecánicos ni cuentas.

**Comportamiento:**

- Cada instrumento muestra su propio estado de carga (un esqueleto con su misma forma) y su propio error, sin tumbar los demás.
- Los datos se refrescan al volver a Inicio y cada 60 segundos mientras está abierto.

**Atajo Ctrl+N:** en Inicio y en Mostrador abre «Vender»; en cada lista con «Nuevo …» abre ese formulario. Ctrl+N es el atajo de «nueva ventana» de WebView2: hay que confirmar en Windows que `preventDefault` lo bloquea. Si no lo bloquea, se usa Alt+N y se cambia el texto visible *(decisión del constructor, comprobando en Windows)*.

## Vistas (parte 5)

Todas las pantallas usan las mismas piezas, como en la maqueta `vistas.html`.

**Piezas compartidas** (componentes nuevos en `components/`):

- `EncabezadoDePantalla`:
  - una placa negra de 38px con el icono de la sección en lima y un filete lima abajo;
  - el título (el `h2` visible de la pantalla), con una línea que dice para qué sirve;
  - a la derecha, las acciones, con la principal en lima y su atajo visible.
- `FranjaDeIndicadores`: de 2 a 4 celdas unidas por una línea fina, cada una con un rótulo en mayúsculas y una cifra. Una celda de alerta lleva un filete superior naranja. Si la pantalla no tiene datos exactos para un indicador, no lleva franja.
- `BarraDeFiltros`:
  - la búsqueda a la izquierda, con la tecla `/` para enfocarla;
  - los filtros como botones que se activan (los activos van en negro con el punto lima), y las listas desplegables también con forma de botón;
  - a la derecha, el número de resultados.
- **Tablas:**
  - encabezado en mayúsculas pequeñas sobre `#f6f5f2`, fijo al desplazar;
  - filas de unos 34px;
  - los códigos en letra de máquina (`Cascadia Mono`, `Consolas`) dentro de una pastilla, y los tipos como etiqueta;
  - la existencia como un medidor con «actual / mínimo», en naranja si `is_low_stock`;
  - la fila elegida en oliva claro, con filete a la izquierda;
  - el teclado mueve la selección con las flechas, y Enter abre la ficha.
- `Ficha`: el panel de la derecha (300px) con un filete lima arriba, que muestra el elemento elegido: datos principales, cifras y actividad reciente, con sus acciones al pie. En una ventana angosta se abre como `PanelLateral`. Esc la cierra.
- `EstadoVacio`: el icono de la sección en grande y en gris, una frase y la acción para empezar. Sustituye a los «No hay resultados» de solo texto.

**Qué lleva cada pantalla.** Los indicadores solo usan datos exactos: el `count` de una consulta con `page_size=1`, el total que da la API o la suma de una lista sin paginar.

| Pantalla | Indicadores (fuente) | Ficha a la derecha |
| --- | --- | --- |
| Vender | Ninguno. El carrito como recibo y el total en un instrumento negro | No |
| Ventas | Ventas de hoy y total de hoy (como en Inicio); anuladas hoy (`count`, `voided=true`) | Sí: detalle de la venta, con «Abrir recibo» |
| Devoluciones | Devoluciones de hoy (`count`) | Sí: detalle de la devolución |
| Productos | Productos activos (`count`); insumos de taller (`count`, `workshop_supply=true`) | Sí: precio, costo y margen (solo el dueño), existencia, ubicación, motos y los 5 últimos movimientos (`/inventory/movements?product=`) |
| Movimientos | Movimientos de hoy (`count` con la fecha) | No |
| Inventario inicial | Productos y unidades contados (`InitialCountStatus`) | No |
| Tipos, marcas y motos | Cuántos tipos, marcas y motos hay (largo de cada lista) | No |
| Liquidación del día | Total por pagar (`total`); mecánicos con pendiente; servicios | No |
| Historial de liquidaciones | Liquidaciones (`count`) | Sí: detalle de la liquidación |
| Mecánicos / Tipos de servicio | Cuántos activos (largo de la lista) | No |
| Compras | Borradores (`count`, `status=draft`); recibidas este mes (`count`) | No (el detalle sigue en su ruta) |
| Proveedores | Debo en total (suma de `balance_due`); proveedores con saldo | No (el estado de cuenta sigue igual) |
| Abonos | Abonos este mes (`count`); debo en total | No |
| Caja de hoy | El resumen actual, con el efectivo esperado como instrumento negro | No |
| Cajas anteriores | Cajas cerradas (`count`) | Sí: resumen de la caja |
| Locales | Me deben en total (suma de `balance_due`); locales con saldo | No |
| Entregas / Reportes / Pagos | Cuántos este mes (`count`) | No |
| Datos del negocio / Actualizar programa | Ninguno; formulario en una tarjeta de ancho fijo (640px) | No |
| Usuarios | Usuarios activos (largo de la lista) | No |

- Los formularios siguen en el `PanelLateral` actual, con los mismos tokens y la misma retícula.
- Ninguna pantalla pierde funciones, campos, permisos ni textos de ayuda. Solo cambia la presentación.

## Cómo comprobarlo

- Pruebas de Vitest del menú: secciones por rol, sección actual desplegada, una sola abierta, ir a la primera pantalla al abrir, `aria-current`, recogido con ventanita.
- Pruebas de rutas: las nuevas abren su pantalla, las viejas redirigen, el vendedor recibe «sin permiso» en las del dueño.
- `npm run build`, `npm run lint` y `npm test` sin errores.
- Pruebas de Inicio, del acceso (el hook de ventana se llama con la fase correcta, simulando `@tauri-apps/api/window`) y de las piezas compartidas: indicadores con datos exactos, ficha con teclado y Esc, filtros activos y estado vacío.
- **Revisión visual pantalla por pantalla**, a 900 × 560, 1280 × 800 y 1920 × 1080, como dueño y como vendedor, con capturas guardadas en `.superpowers/capturas/` (sin versionar). Para cada captura se recorre la lista de *Reglas de orden y alineación*: retícula, alturas iguales, números a la derecha, textos sin cortar ni encimar y contraste.
- Juan confirma en la ventana de Tauri en Windows el login pequeño, el cambio de tamaño al entrar y al salir, y el atajo Ctrl+N.
