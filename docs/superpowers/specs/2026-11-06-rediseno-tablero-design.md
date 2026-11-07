# Rediseño «Tablero»: marco, iconos y paneles laterales

## Intención

Hoy Punto Moto funciona, pero se ve plano y genérico, como una plantilla más. Juan quiere que el cliente quede asombrado al abrirlo: que se note que el programa se hizo con cuidado y que la experiencia sea excelente. Sigue siendo **un programa de Windows, no una página web**: ventana fija, densidad de aplicación, controles compactos y tipografía del sistema.

Se toman de AVISENS (`avisens-frontend/src/app/layout/`) sus funciones de navegación, no su apariencia web: menú en dos niveles, menú que se recoge y buscador de pantallas.

Maquetas aprobadas, en `.superpowers/brainstorm/18364-1793888126/content/` (carpeta local sin versionar):

- `direcciones-v2.html`, opción **B · Tablero**: marco.
- `emergentes.html`, opción **B · Panel lateral**: formularios emergentes.

## Objetivos

1. Marco nuevo con la dirección **Tablero**: todo el marco en negro, como el tablero de una moto, y contenido claro.
2. Navegación en dos niveles: una **columna de iconos** con los módulos y, a su lado, un **panel contextual** con las pantallas del módulo elegido.
3. **Iconos** en el menú, en los botones de acción y en las cabeceras de los paneles.
4. **Panel lateral emergente** reutilizable para los formularios cortos y medianos, en lugar de reemplazar la lista dentro de la pantalla.
5. **Inicio** con accesos rápidos y el estado de la caja de hoy, en lugar del saludo plano.
6. Pulido general de los componentes compartidos con el nuevo lenguaje visual: botones, campos, tablas, avisos y estados vacíos.

## Fuera de alcance

- Modo oscuro completo del área de trabajo. El marco es oscuro y el contenido sigue claro.
- Adaptación a celular. Hay un tamaño mínimo de ventana, como en todo programa de escritorio.
- Nuevas pantallas o indicadores que el backend no entrega. Inicio solo usa datos de endpoints ya documentados en `docs/backend/API.md`.
- Atajos de teclas de función (F2 Vender, etc.). Quedan para una fase posterior, cuando se compruebe que no chocan con WebView2.
- Cambios en el backend o en el contrato de la API.

## Resultados que no se aceptan

Aunque funcione, el trabajo falla si:

- Parece una página web: esquinas muy redondeadas, sombras de landing, mucho espacio vacío, scroll de toda la página.
- Se rompe algún permiso por rol: un vendedor ve en el menú, en el buscador o en Inicio algo reservado al dueño.
- Se pierde la navegación con teclado o el foco visible.
- Fallan las pruebas existentes del frontend o se quitan pruebas para que pasen.

## Programa de escritorio, no página web

Es la regla principal del rediseño: cada decisión visual se mide contra ella. Un programa de Windows bien hecho (el Explorador, Outlook o un sistema de punto de venta) se reconoce por esto, y Punto Moto debe cumplirlo todo:

- **Ventana fija:** el marco ocupa siempre el 100% de la ventana y nunca se desplaza. Solo se desplaza el área de trabajo, o el cuerpo del panel, con barras de desplazamiento finas. Sin scroll de toda la página ni rebote al final.
- **El marco está anclado, no flota:** la columna de iconos, el panel contextual y las barras superior y de estado van pegados a los bordes de la ventana, sin márgenes alrededor ni esquinas redondeadas. Nada de «tarjetas flotantes» como el menú de AVISENS.
- **Panel lateral anclado al borde derecho,** de arriba abajo del área bajo la barra superior, sin esquinas redondeadas.
- **Densidad de aplicación:** Segoe UI a 14px, controles de 32px de alto, márgenes interiores de 12 a 20px y tablas compactas con filas de unos 32px. No hay secciones grandes con mucho aire, ni bloques «hero», ni títulos enormes: el `h1` de cada pantalla mide unos 20px.
- **Esquinas discretas:** 4px en controles, tarjetas y tablas, y 6px en el diálogo centrado y el buscador. Nada de 12px o más, ni botones en forma de píldora; la única excepción es el indicador de la caja.
- **Sombras solo para lo que flota encima:** panel, diálogo, buscador y menús. Las tarjetas del área de trabajo se separan con borde o con el filete lima, no con sombras grandes.
- **Comportamiento de programa:**
  - Cursor normal (flecha) en botones y menú, no la mano de enlace web.
  - El marco no se selecciona como texto ni se arrastra.
  - No hay subrayados de enlace en la navegación.
  - El estado activo se ve siempre, no solo al pasar el mouse.
- **Teclado primero:** todo se puede hacer sin mouse, con atajos visibles junto a las acciones (Esc, Ctrl+Enter, Ctrl+K, Ctrl+B).
- **Tamaño mínimo en lugar de diseño adaptable:** al achicar la ventana nada se apila como en un celular. El programa no se encoge por debajo de 900 × 560, y en ese tamaño se recoge el panel contextual.
- **Movimiento breve y funcional:** el panel entra deslizándose en menos de 200ms. Sin animaciones decorativas ni efectos de desplazamiento.

**Cómo comprobarlo:** captura de la ventana de Tauri a 1280 × 800 y a 900 × 560. Si alguien que no conoce el proyecto la mira y piensa «esto es una página», no está terminado.

## Restricciones

- Ventana de Tauri: 1280 × 800 al abrir, mínimo **900 × 560** (`desktop/src-tauri/tauri.conf.json`). Todo debe caber y funcionar en el mínimo.
- Las medidas y reglas visuales de la sección anterior son obligatorias.
- `destinos.ts` sigue siendo la única fuente de las pantallas y de quién puede verlas. El menú, el panel contextual y el buscador salen de ahí.
- El lima `#cde409` solo va como relleno con texto negro o sobre negro; nunca como texto sobre fondo claro (regla de contraste ya escrita en `index.css`). Sobre fondo claro, el texto de acento usa el oliva `#4a5700`.
- Contraste WCAG AA para todo texto funcional, y ningún texto funcional por debajo de 11px.
- Seguir funcionando en el navegador (modo de desarrollo sin Tauri).
- Todo el código, los textos y los comentarios en español, con el estilo del proyecto.

## Decisiones tomadas

### Paleta del marco

| Uso | Color |
| --- | --- |
| Marco (columna de iconos, panel contextual, barra superior, barra de estado) | `#0b0b0c` |
| Separadores del marco | `#1f1f20` |
| Selección dentro del marco | fondo `#1a1c10`, texto e icono lima |
| Línea bajo la barra superior | 2px lima |
| Fondo del área de trabajo | `#ecebe6` |
| Tarjetas y superficies | `#ffffff` |
| Texto secundario sobre negro | `#9c9c99` o más claro |
| Texto secundario sobre claro | `#5f636a` o más oscuro |

Se conservan los tokens actuales de error, alerta, éxito y foco de `index.css`.

### Marco

- **Columna de iconos** (unos 62px): logo arriba y un icono con su etiqueta corta para cada módulo de `MENU_PRINCIPAL`. Configuración va abajo, junto con el botón de recoger el menú. El módulo activo lleva una barra lima a la izquierda y el icono en lima.
- **Panel contextual** (unos 190px): nombre del módulo, una línea que explica para qué sirve y la lista de sus pantallas, cada una con icono y una descripción corta. Para módulos de una sola pantalla (Productos, Movimientos), el panel muestra esa entrada sola.
- **Ctrl+B** recoge y expande el panel contextual; la columna de iconos siempre queda. La preferencia se recuerda entre aperturas.
- **Barra superior negra** con línea lima abajo. Contiene:
  - el negocio y la ruta («Venta › Vender»);
  - el buscador **Ctrl+K**;
  - la caja, como una pastilla verde si está abierta;
  - la fecha y la hora, con la hora en lima y cifras tabulares;
  - las iniciales del usuario en un círculo lima;
  - cerrar sesión.

  Se mantiene `data-tauri-drag-region`.
- **Barra de estado** negra abajo, con la conexión y la versión, como hoy.

### Pestañas dentro de las secciones

El panel contextual ya muestra las pantallas del módulo, así que las pestañas de `SeccionConPestanas` dejan de ser necesarias. Las secciones conservan su título (`h1`) y se quitan las pestañas.

### Buscador Ctrl+K

Ventana centrada sobre un velo oscuro. Busca **pantallas** a las que el rol tiene acceso, sin tildes y sin distinguir mayúsculas. Cada resultado se muestra como «Módulo › Pantalla». Se recorre con las flechas, Enter abre la pantalla y Esc cierra. Buscar productos queda fuera de esta fase.

### Panel lateral emergente

Es un componente único y reutilizable, con este comportamiento:

- Entra desde la derecha, anclado al borde de la ventana y sin esquinas redondeadas, sobre un velo oscuro semitransparente, con una línea lima de 3px en el borde izquierdo. La pantalla de atrás queda visible pero no se puede usar.
- **Cabecera:** módulo en mayúsculas pequeñas (en oliva), título, una línea de explicación y el botón cerrar.
- **Cuerpo con scroll propio.** Pie fijo con la ayuda de atajos a la izquierda y los botones Cancelar y la acción principal (lima con icono) a la derecha.
- **Teclado:**
  - Esc cierra el panel.
  - Ctrl+Enter guarda.
  - El foco queda atrapado dentro mientras está abierto.
  - Al abrir, el foco va al primer campo.
  - Al cerrar, el foco vuelve al botón que lo abrió.
- Si el formulario tiene cambios sin guardar, pregunta antes de cerrar.
- **Ancho:** normal unos 400px; ancho unos 560px, para la devolución.
- **Vista previa del resultado:** cuando el formulario cambia una cifra, se muestra el antes y el después antes de guardar, en una franja negra con el valor nuevo en lima. Por ejemplo, existencias «12 → 15» o el cierre de caja con esperado contra contado.
- Cuando el panel se guarda, se cierra y se muestra el aviso de éxito que ya produce el formulario.

**Formularios que pasan al panel lateral:**

| Sección | Formularios |
| --- | --- |
| Productos | Nuevo producto, editar producto, ajustar existencias |
| Compras | Nuevo y editar proveedor, registrar abono |
| Caja | Abrir caja, gasto, retiro, cierre |
| Inventario | Consumo del taller |
| Consignación | Nuevo local, pago de un local |
| Venta | Devolución (panel ancho, desde el detalle de la venta) |
| Configuración | Usuarios, cambiar clave, tipos/marcas/motos, tipos de servicio, mecánicos |

**Siguen en pantalla completa:** Vender, Nueva compra y Recibir compra, entregas y reportes de consignación, inventario inicial y liquidación del día.

### Confirmaciones

Eliminar un producto, anular una venta y acciones parecidas usan un **diálogo pequeño centrado**: cabecera negra, una frase clara de lo que va a pasar y el botón de la acción en rojo. Esc y Cancelar cierran sin hacer nada. El foco empieza en Cancelar.

### Inicio

- **Saludo según la hora** (buenos días, buenas tardes o buenas noches) con el nombre y el rol, y a la derecha el botón principal «Nueva venta».
- **Accesos rápidos:** una fila de tarjetas blancas compactas (unos 80px de alto, esquinas de 4px) con borde superior lima, cada una con icono, nombre y una línea de descripción. Solo aparecen las pantallas que el rol puede ver: Vender, Productos y, para el dueño, Caja de hoy y Liquidación.
- **Tarjeta de caja de hoy**, en negro con la cifra en lima. Solo la ve el dueño y usa `useCajaActual`: efectivo esperado, hora y monto de apertura, gastos y retiros si el endpoint los trae. Si la caja está cerrada, ofrece abrirla.
- **Actualizaciones del programa:** el componente actual `Actualizaciones`, solo para el dueño, con el estilo nuevo.

### Iconos

Se usa la librería **`lucide-react`**, que se agrega como dependencia. El trazo y el tamaño son uniformes (16px en botones, 18 a 20px en el menú). Cada destino de `destinos.ts` tiene su icono, y los botones de acción principales llevan icono y texto. Un botón con solo icono debe tener `aria-label`.

### Entrega

- El panel se abre por el **estado** de la pantalla, no por la URL: las rutas por hash no cambian y Atrás no cierra el panel.
- Para la tarjeta de caja, solo se usan los campos que `GET` de la caja actual ya devuelve según `docs/backend/API.md`. Si falta un dato, no se muestra.
- Se trabaja en una rama `feat/frontend-rediseno` siguiendo el flujo de siempre: Juan aprueba cada commit, el push, el PR y el merge.
- El rediseño llega a los programas instalados solo cuando se publique una versión superior del escritorio, según `docs/PUBLICACION.md`. Publicarla no forma parte de este trabajo.

## Lo que se deja al constructor

- Los nombres internos de los componentes y archivos, y cómo se organiza el CSS: puede seguir en `index.css` o dividirse por componentes.
- Qué icono concreto corresponde a cada pantalla.
- Las animaciones de entrada del panel, del diálogo y del buscador. Deben ser cortas (menos de 200ms) y respetar `prefers-reduced-motion`.
- El orden de las entregas, siempre que cada una deje las pruebas en verde: marco, panel, migración de formularios, Inicio y pulido.
- Las pruebas nuevas de los comportamientos de teclado del panel, del diálogo y del buscador.

## Verificación

- Pasan las pruebas, el lint y el build del frontend; se agregan pruebas del panel, el diálogo, el buscador y el menú por rol.
- Revisión visual en la ventana de Tauri a 1280 × 800 y al mínimo de 900 × 560, con el menú expandido y recogido.
- Recorrido con solo teclado: Ctrl+K, Ctrl+B, abrir y cerrar un panel, guardar con Ctrl+Enter.
- Comprobación con usuario dueño y usuario vendedor.
