# Menú por secciones que se despliegan

## Intención

El marco «Tablero» (PR #23) dejó una columna de iconos con los módulos y, al lado, una subbarra con las pantallas del módulo abierto. A Juan esa subbarra no lo convence: las pantallas quedan separadas de su sección y hay demasiados botones a la vista. Además, Configuración mezcla cosas del programa con cosas del trabajo diario (tipos, marcas y motos; tipos de servicio; mecánicos) e Inicio tiene el botón de actualizar el programa.

Este cambio es el primer paso de una serie (después vienen Inicio con resumen, el inicio de sesión pequeño, el logo sin fondo y una pasada de diseño en las vistas). Aquí solo se rehace **la navegación** y se ordena **dónde vive cada pantalla**.

Maqueta aprobada: `.superpowers/brainstorm/73643-1794094393/content/menu.html`, opción **B · Secciones que se despliegan** (carpeta local sin versionar).

## Objetivos

1. Un solo menú lateral negro, anclado a la izquierda, en lugar de la columna de iconos más la subbarra.
2. Cada pantalla cuelga de su sección. Solo la sección actual está desplegada; las demás se ven como una fila con su icono y una flecha.
3. Configuración queda solo con lo del programa, al pie del menú y separada del trabajo diario.
4. El botón de actualizar el programa sale de Inicio y pasa a Configuración.
5. Se quitan las pestañas internas de las secciones (`SeccionConPestanas`), que repiten lo que ya muestra el menú.

## Fuera de alcance

- El contenido de Inicio (resumen del día), el inicio de sesión y el logo sin fondo: van en pasos siguientes.
- Rediseño visual de las pantallas internas.
- «Cambiar mi clave» para cada usuario: el backend no tiene ese endpoint (solo `POST /users/{id}/set-password` para el dueño, que ya está en Usuarios). No se construye.
- Cambios en el backend o en el contrato de la API.

## Resultados que no se aceptan

- Un vendedor ve en el menú, en el buscador o por una ruta escrita a mano una pantalla del dueño.
- Se pierde la navegación con teclado o el foco visible en el menú.
- El menú parece de página web: tarjeta flotante, esquinas grandes, sombras, scroll de toda la ventana.
- Fallan las pruebas existentes o se quitan pruebas para que pasen (las que prueban la columna o la subbarra se reescriben para el menú nuevo).
- Alguna pantalla queda sin entrada en el menú o en dos secciones a la vez.

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

## Cómo comprobarlo

- Pruebas de Vitest del menú: secciones por rol, sección actual desplegada, una sola abierta, ir a la primera pantalla al abrir, `aria-current`, recogido con ventanita.
- Pruebas de rutas: las nuevas abren su pantalla, las viejas redirigen, el vendedor recibe «sin permiso» en las del dueño.
- `npm run build`, `npm run lint` y `npm test` sin errores.
- Captura a 1280 × 800 y a 900 × 560, como dueño y como vendedor, con el menú expandido y recogido.
