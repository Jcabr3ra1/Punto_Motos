# Rediseño: menú por secciones, acceso, Inicio y vistas. Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** reemplazar la columna de iconos y la subbarra por un menú con secciones que se despliegan, quitar el fondo del logo, hacer el inicio de sesión en una ventana pequeña, dar a Inicio un resumen del día y aplicar a todas las pantallas el mismo lenguaje visual, alineado y adaptable.

**Arquitectura:** `navegacion/destinos.ts` sigue siendo la única fuente de verdad: define las secciones (`MENU_PRINCIPAL`), sus pantallas (`SUBMENUS`) y quién las ve. La sección abierta no es un estado propio: siempre es `moduloDe(pathname)`, así que «una sola abierta» y «la actual siempre abierta» salen solas. Un componente nuevo, `MenuLateral`, dibuja el menú expandido y el recogido. `SeccionConPestanas` se reemplaza por `Seccion`, que solo pone un `h1` para lectores de pantalla y el `Outlet`.

**Tecnología:** React 19 + TypeScript, React Router (rutas por hash), TanStack Query, lucide-react, Vitest + Testing Library, oxlint.

**Diseño:** `docs/superpowers/specs/2026-11-07-rediseno-secciones-y-vistas-design.md` (leerlo junto con este plan).

## Restricciones globales

- Programa de Windows, no página web: menú anclado a la izquierda, sin esquinas redondeadas ni sombras en el menú, sin scroll de toda la ventana. Cursor de flecha en el menú.
- Colores solo con los tokens existentes de `src/index.css`: `--marco`, `--marco-separador`, `--marco-seleccion`, `--marco-elevado`, `--marco-texto`, `--marco-texto-suave`, `--color-marca`. Textos sobre `--marco` con contraste AA (4,5:1).
- Ancho del menú: **228px** expandido y **56px** recogido. Marca de la pantalla actual: barra lima de **3px** a la izquierda.
- Animación del despliegue: ninguna, o menos de **150ms**; ninguna con `prefers-reduced-motion`.
- Clave de la preferencia de recogido: `puntomoto.menuRecogido` (sin cambios). Ventana angosta: `(max-width: 1000px)` (sin cambios).
- Textos de la interfaz en español. Commits en español con Conventional Commits, sin `Co-Authored-By`.
- No se tocan el backend ni `docs/backend/`.
- Las *Reglas de orden y alineación* y la *Adaptación al tamaño de la ventana* del diseño valen para todas las tareas, desde la 6: retícula de 4px (`--esp-1`…`--esp-8`), un canal de 12px, cifras con `tabular-nums` alineadas a la derecha, nada por debajo de 11px, controles de 32px, puntos suspensivos en lugar de textos desbordados y cortes en 1100px por consulta de contenedor.
- Los indicadores solo usan datos exactos: el `count` de una consulta con `page_size=1`, un total que da la API o la suma de una lista sin paginar. Nunca la suma de una página.
- No se quitan pruebas para que pasen: las de la columna y la subbarra se reescriben para el menú nuevo.

## Puntos que debe vigilar la revisión

1. **El vendedor escribe a mano una ruta nueva del dueño** (`/inventario/catalogo`, `/taller/mecanicos`, `/configuracion/actualizaciones`): debe ver «No tienes permiso» y no la pantalla. → prueba en la tarea 2.
2. **Ruta vieja guardada** (`/productos`, `/configuracion/mecanicos`, `/inventario-inicial`): debe abrir la pantalla nueva, no «No encontramos esa pantalla». → prueba en la tarea 2.
3. **El conteo inicial se cierra mientras el dueño está en Inventario:** la entrada «Inventario inicial» desaparece del menú y del buscador, y las demás pantallas de Inventario siguen. → prueba en la tarea 1 (`pantallasVisibles`) y en la tarea 3.
4. **Pantalla de detalle** (`/venta/historial/41`, `/compras/lista/15`): la sección correcta sigue desplegada y su pantalla madre marcada. → prueba en la tarea 3.
5. **Menú recogido usado solo con teclado:** el foco en un icono abre la ventanita, Tab llega a sus enlaces y Esc la cierra devolviendo el foco al icono. → prueba en la tarea 4.
6. **La sesión vence o se cierra con la ventana grande:** la ventana vuelve a 760 × 500 y no queda grande con el login perdido en un rincón. → prueba en la tarea 8.
7. **Día con más de 200 ventas:** Inicio y Ventas suman todas las páginas, no solo la primera. → prueba en la tarea 9.
8. **Un endpoint de Inicio falla** (por ejemplo `/suppliers`): solo su instrumento muestra el error y los demás siguen. → prueba en la tarea 9.
9. **Ctrl+N con un panel o el buscador abiertos:** no abre nada encima. → prueba en la tarea 6.
10. **Ficha abierta y la fila desaparece** (al filtrar o al cambiar de página): la ficha se cierra en lugar de mostrar datos viejos. → prueba en la tarea 6.

---

### Tarea 1: Secciones y rutas nuevas en `destinos.ts`

**Archivos:**
- Modificar: `frontend/src/navegacion/destinos.ts`
- Modificar: `frontend/src/navegacion/buscar.ts` (solo si hace falta para usar `pantallasVisibles`)
- Pruebas: `frontend/src/navegacion/destinos.test.ts`, `frontend/src/navegacion/ubicacion.test.ts`, `frontend/src/navegacion/buscar.test.ts`

**Interfaces:**
- Produce:
  - `DESTINOS.inventario`: `{ ruta: '/inventario', etiqueta: 'Inventario', roles: TODOS, icono: Boxes, descripcion: 'Productos, existencias y clasificación' }`.
  - `DESTINOS.actualizaciones`: `{ ruta: '/configuracion/actualizaciones', etiqueta: 'Actualizar programa', roles: SOLO_DUENO, icono: RefreshCw, descripcion: 'Buscar e instalar una versión nueva' }`.
  - Rutas cambiadas: `productos.ruta = '/inventario/productos'`, `inventarioInicial.ruta = '/inventario/inicial'`, `catalogo.ruta = '/inventario/catalogo'`, `mecanicos.ruta = '/taller/mecanicos'`, `tiposDeServicio.ruta = '/taller/servicios'`. `venta.etiqueta = 'Mostrador'`.
  - `MENU_PRINCIPAL = [inicio, venta, inventario, taller, compras, caja, consignacion, configuracion]`.
  - `MENU_INVENTARIO = [productos, movimientos, inventarioInicial, catalogo]`; `MENU_TALLER = [liquidacion, historialDeLiquidaciones, mecanicos, tiposDeServicio]`; `MENU_CONFIGURACION = [negocio, usuarios, actualizaciones]`. `SUBMENUS` incluye `[DESTINOS.inventario.ruta]: MENU_INVENTARIO`.
  - `pantallasVisibles(modulo: Destino, rol: Role, conteoAbierto: boolean): readonly Destino[]`: como `pantallasDe`, pero además oculta las que tienen `soloConConteoAbierto` si `conteoAbierto` es `false`.
  - `RUTAS_ANTERIORES: Readonly<Record<string, string>>` = `{ '/productos': '/inventario/productos', '/inventario-inicial': '/inventario/inicial', '/configuracion/catalogo': '/inventario/catalogo', '/configuracion/mecanicos': '/taller/mecanicos', '/configuracion/servicios': '/taller/servicios' }`.

- [ ] **Paso 1: escribir las pruebas que fallan**

En `destinos.test.ts`:
- `'el menú principal tiene las secciones en orden'`: `MENU_PRINCIPAL.map(d => d.etiqueta)` es `['Inicio', 'Mostrador', 'Inventario', 'Taller', 'Compras', 'Caja', 'Consignación', 'Configuración']`.
- `'cada pantalla está en una sola sección'`: aplanar `Object.values(SUBMENUS)` y comprobar que no hay rutas repetidas.
- `'la ruta de cada pantalla empieza por la de su sección'`: para cada `[ruta, pantallas]` de `SUBMENUS`, cada `pantalla.ruta` empieza por `` `${ruta}/` ``.
- `'pantallasVisibles oculta el inventario inicial sin conteo abierto'`: con `(DESTINOS.inventario, 'owner', false)` da `[productos, movimientos, catalogo]`; con `true` da las cuatro; con `('seller', true)` da `[productos, movimientos]`.
- `'configuración del vendedor solo tiene Datos del negocio'`: `pantallasVisibles(DESTINOS.configuracion, 'seller', false)` es `[DESTINOS.negocio]`.
- Cambiar la prueba existente `'un módulo sin submenú se devuelve solo'` para que use `DESTINOS.inicio` (Productos ya no es un módulo).

En `ubicacion.test.ts`, reemplazar la tabla por:
`['/', {seccion:'Inicio'}]`, `['/venta/vender', {seccion:'Mostrador', pestana:'Vender'}]`, `['/venta/historial/41', {seccion:'Mostrador', pestana:'Ventas'}]`, `['/compras/lista/15', {seccion:'Compras'}]`, `['/taller/mecanicos', {seccion:'Taller', pestana:'Mecánicos'}]`, `['/inventario/productos', {seccion:'Inventario', pestana:'Productos'}]`, `['/inventario/catalogo', {seccion:'Inventario', pestana:'Tipos, marcas y motos'}]`, `['/configuracion/actualizaciones', {seccion:'Configuración', pestana:'Actualizar programa'}]`, `['/no-existe', {seccion:''}]`.

En `buscar.test.ts`, agregar `'mecánicos está dentro de Taller'`: el primer resultado de `buscarPantallas('mecanicos', 'owner', false)` tiene `destino: DESTINOS.mecanicos` y `modulo: DESTINOS.taller`. Ajustar cualquier prueba existente que dependa de «Venta» o de Productos como módulo.

- [ ] **Paso 2: correr y ver que fallan**

Ejecutar: `cd frontend && npx vitest run src/navegacion`
Resultado esperado: FALLAN las pruebas nuevas (etiquetas y rutas viejas, `pantallasVisibles` no existe).

- [ ] **Paso 3: implementar en `destinos.ts`** los cambios del bloque *Produce*. `pantallasDe` se mantiene. `buscar.ts` sigue armando `PANTALLAS` desde `MENU_PRINCIPAL` y `SUBMENUS`, así que debería funcionar sin cambios.

- [ ] **Paso 4: correr y ver que pasan**

Ejecutar: `cd frontend && npx vitest run src/navegacion`
Resultado esperado: PASAN. (Otras pruebas, como `Rutas.test.tsx`, pueden fallar hasta la tarea 2.)

- [ ] **Paso 5: commit**

```bash
git add frontend/src/navegacion
git commit -m "feat(frontend): ordenar las pantallas por sección en los destinos"
```

### Tarea 2: Rutas, secciones sin pestañas y pantalla «Actualizar programa»

**Archivos:**
- Crear: `frontend/src/components/Seccion.tsx`
- Crear: `frontend/src/pages/configuracion/ActualizarPrograma.tsx`
- Eliminar: `frontend/src/components/SeccionConPestanas.tsx`
- Modificar: `frontend/src/Rutas.tsx`, `frontend/src/pages/compras/Compras.tsx`, `frontend/src/pages/configuracion/Configuracion.tsx`, `frontend/src/pages/Inicio.tsx`
- Modificar el título principal de `pages/productos/Productos.tsx`, `pages/inventario/Movimientos.tsx` y `pages/inventario/InventarioInicial.tsx` de `<Titulo>` a `<Titulo nivel={2}>` (ahora están dentro de la sección Inventario).
- Opcional *(decisión del constructor)*: mover `pages/configuracion/catalogo/` a `pages/inventario/catalogo/` y `pages/configuracion/taller/` a `pages/taller/`, actualizando sus importaciones.
- Pruebas: `frontend/src/Rutas.test.tsx`

**Interfaces:**
- Consume (tarea 1): `DESTINOS.*`, `MENU_*`, `RUTAS_ANTERIORES`.
- Produce: `Seccion({ titulo }: { titulo: string })` → `<section className="seccion"><h1 className="solo-lectores">{titulo}</h1><Outlet /></section>`. Así cada sección conserva un solo `h1` y la pantalla pone su `h2` visible. `ActualizarPrograma()` → `<section>` con `<Titulo nivel={2}>Actualizar programa</Titulo>` y `<Actualizaciones />`.

- [ ] **Paso 1: escribir las pruebas que fallan** en `Rutas.test.tsx` (agregar los simulados de API que pidan las pantallas nuevas: `GET /service-types*`, `GET /mechanics*`, `GET /inventory/movements*`)

- `'las pantallas movidas abren en su ruta nueva'`, con `it.each` sobre `[['/inventario/productos','Productos'], ['/inventario/catalogo','Tipos, marcas y motos'], ['/taller/mecanicos','Mecánicos'], ['/taller/servicios','Tipos de servicio'], ['/configuracion/actualizaciones','Actualizar programa']]`: el dueño ve el `heading` con ese nombre.
- `'las rutas anteriores llevan a la nueva'`, con `it.each` sobre las cinco entradas de `RUTAS_ANTERIORES`: al montar la ruta vieja, se ve la pantalla nueva y no el `heading` «No encontramos esa pantalla».
- `'/inventario lleva a Productos'`: el dueño ve el `heading` «Productos».
- `'el vendedor no entra a las pantallas nuevas del dueño'`, con `it.each` sobre `['/inventario/catalogo', '/taller/mecanicos', '/configuracion/actualizaciones']`: se ve el `heading` «No tienes permiso para ver esta pantalla».
- `'cada sección tiene un solo título principal'`, con `it.each` sobre `['/compras/proveedores', '/configuracion/negocio', '/inventario/productos', '/taller/mecanicos']`: `getAllByRole('heading', { level: 1 })` tiene longitud 1.
- `'Inicio ya no ofrece actualizar el programa'`: el dueño en `/` no ve el texto «Buscando actualizaciones…» ni un botón «Buscar actualizaciones».
- Quitar o reescribir las pruebas de `describe('configuración')` que buscan `navigation` «Configuración» con pestañas (ese menú ya no existe en la pantalla; la tarea 3 lo prueba en el menú lateral).

- [ ] **Paso 2: correr y ver que fallan**

Ejecutar: `cd frontend && npx vitest run src/Rutas.test.tsx`
Resultado esperado: FALLAN las pruebas nuevas.

- [ ] **Paso 3: implementar**

En `Rutas.tsx`:
- Cada sección con submenú (`venta`, `inventario`, `compras`, `taller`, `caja`, `consignacion`, `configuracion`) usa `<Seccion titulo={DESTINOS.x.etiqueta}>` (envuelto en `Permiso` donde ya lo estaba).
- `inventario` con índice `<Navigate to="productos" replace />`, e hijos `productos`, `movimientos`, `inicial` (con el mismo `Permiso` y la condición del conteo que tiene hoy `/inventario-inicial`) y `catalogo` (con `Permiso destino={DESTINOS.catalogo} nivel={2}`).
- `taller` suma `mecanicos` y `servicios` con su `Permiso nivel={2}`.
- `configuracion`: `negocio`, `usuarios` y `actualizaciones` (con `Permiso destino={DESTINOS.actualizaciones} nivel={2}`).
- Una ruta por cada entrada de `RUTAS_ANTERIORES` con `<Navigate to={nueva} replace />`.

`Compras.tsx` y `Configuracion.tsx` usan `Seccion`, o se eliminan si `Rutas.tsx` usa `Seccion` directamente *(decisión del constructor)*. En `Inicio.tsx`, quitar `<Actualizaciones />` y su importación.

- [ ] **Paso 4: correr toda la suite**

Ejecutar: `cd frontend && npx vitest run`
Resultado esperado: PASA `Rutas.test.tsx`. Las pruebas de `Estructura.test.tsx` que dependen de la columna o del panel pueden fallar; se reescriben en la tarea 3. Nada más debe fallar.

- [ ] **Paso 5: commit**

```bash
git add frontend/src
git commit -m "feat(frontend): mover pantallas a su sección y llevar las actualizaciones a configuración"
```

### Tarea 3: `MenuLateral` expandido

**Archivos:**
- Crear: `frontend/src/estructura/MenuLateral.tsx`
- Eliminar: `frontend/src/estructura/ColumnaDeIconos.tsx`, `frontend/src/estructura/PanelContextual.tsx`
- Modificar: `frontend/src/estructura/Estructura.tsx`, `frontend/src/estructura/useMenuRecogido.ts` (quitar `ContextoMenuRecogido` y `useMenuRecogido` si ya nadie los usa), `frontend/src/index.css` (estilos `.menu-lateral*`; quitar `.columna*`, `.panel-contextual*` y `.pestanas*` si quedan sin uso)
- Pruebas: reescribir `frontend/src/estructura/Estructura.test.tsx`; ajustar `describe('menú principal')` e `describe('inventario inicial en el menú')` de `Rutas.test.tsx`

**Interfaces:**
- Consume: `MENU_PRINCIPAL`, `pantallasVisibles`, `moduloDe`, `useEstadoDelMenu`.
- Produce: `MenuLateral({ rol, conteoAbierto, recogido, onAlternar, usuario }: { rol: Role; conteoAbierto: boolean; recogido: boolean; onAlternar: () => void; usuario: { display_name: string; role_label: string } })`.

Estructura del DOM (las pruebas dependen de esto):
- `<aside className="menu-lateral">` con el logo, «Punto Moto» y el subtítulo «Tienda y taller».
- `<nav aria-label="Principal">` con:
  - **Inicio:** un `Link`.
  - **Cada sección con pantallas visibles:** un `<button aria-expanded>` con el nombre de la sección y, si está abierta, un `<ul>` con un `NavLink` por pantalla. La sección abierta es `moduloDe(pathname)`. Al pulsar una sección cerrada se hace `navigate(primera.ruta)`; al pulsar la abierta no pasa nada.
  - **Configuración:** igual que las demás secciones, pero en un `<ul>` aparte al pie, separada por una línea.
- La pantalla actual lleva `aria-current="page"`. En las pantallas de detalle, por ejemplo `/venta/historial/41`, se marca su pantalla madre (`NavLink` sin `end`).
- Al pie, el botón de recoger (`aria-label` «Recoger el menú» / «Expandir el menú», `aria-keyshortcuts="Control+B"`, el mismo texto que hoy) y la persona: iniciales, `display_name` y `role_label`.
- Las secciones con una sola pantalla visible se dibujan igual, como sección con su única pantalla.

- [ ] **Paso 1: escribir las pruebas que fallan** en `Estructura.test.tsx` (`const menu = () => screen.getByRole('navigation', { name: 'Principal' })`)

- `'el dueño ve las secciones en orden'`: los nombres accesibles de los `link` y `button` de primer nivel dentro de `menu()` son `['Inicio','Mostrador','Inventario','Taller','Compras','Caja','Consignación','Configuración']` (sin el botón de recoger, que va fuera del `nav`).
- `'el vendedor solo ve sus secciones'`: `['Inicio','Mostrador','Inventario','Configuración']`.
- `'la sección actual está desplegada y marca la pantalla'`: en `/taller/mecanicos`, el botón «Taller» tiene `aria-expanded="true"`, sus enlaces son `['Liquidación del día','Historial de liquidaciones','Mecánicos','Tipos de servicio']` y «Mecánicos» tiene `aria-current="page"`. El botón «Compras» tiene `aria-expanded="false"` y no hay enlace «Proveedores».
- `'al abrir otra sección va a su primera pantalla y cierra la anterior'`: desde `/taller/mecanicos`, clic en «Compras» → se ve el `heading` «Compras» de la lista, «Compras» tiene `aria-expanded="true"` y «Taller» `"false"`.
- `'pulsar la sección abierta no la cierra'`: en `/compras/proveedores`, clic en «Compras» → sigue `aria-expanded="true"` y la pantalla sigue siendo Proveedores.
- `'en una pantalla de detalle se marca su pantalla madre'`: en `/venta/historial/41` (simular `GET /sales/41`), el enlace «Ventas» tiene `aria-current="page"` y «Mostrador» está desplegado.
- `'Inventario del vendedor no muestra pantallas del dueño'`: en `/inventario/productos` como vendedor, los enlaces son `['Productos','Movimientos']`.
- `'el inventario inicial aparece en Inventario solo con el conteo abierto'`: dueño con `GET /inventory/initial-count` → `{ is_open: true, ... }` ve el enlace «Inventario inicial» dentro de Inventario; con `is_open: false`, no. (Reemplaza las pruebas equivalentes de `Rutas.test.tsx` que buscaban el enlace en el menú plano.)
- `'muestra quién tiene la sesión'`: se ven el `display_name` y el `role_label` del vendedor.
- Las pruebas de Ctrl+B y del botón se mantienen, cambiando lo que comprueban: después de Ctrl+B, el `aside` tiene la clase `menu-lateral--recogido`, `localStorage['puntomoto.menuRecogido'] === '1'` y la preferencia se recuerda al volver a montar.

En `Rutas.test.tsx`, la prueba `'muestra el menú completo del dueño'` pasa a comprobar las secciones del dueño, y `'navega a otra pantalla al elegirla'` usa un clic en «Inventario» → `heading` «Productos».

- [ ] **Paso 2: correr y ver que fallan**

Ejecutar: `cd frontend && npx vitest run src/estructura src/Rutas.test.tsx`
Resultado esperado: FALLAN las pruebas nuevas.

- [ ] **Paso 3: implementar `MenuLateral`**, usarlo en `Estructura.tsx` en lugar de `ColumnaDeIconos` y `PanelContextual`, y escribir los estilos

Estilos (`index.css`):
- **Menú:** fondo `--marco`, 228px de ancho y altura completa.
- **Encabezado y pie:** fijos. La lista del centro se desplaza con `overflow-y: auto`.
- **Fila de sección:** 32px de alto, icono de 18px y flecha `ChevronRight`, que pasa a `ChevronDown` cuando está abierta.
- **Pantallas de la sección:** sangría de unos 21px, `border-left: 1px solid var(--marco-separador)` y filas de unos 28px.
- **Pantalla actual:** fondo `--marco-seleccion`, texto blanco y `::before` de 3px en `--color-marca`. El icono de la sección abierta también va en lima.
- Sin `border-radius` en el menú.

- [ ] **Paso 4: correr toda la suite**

Ejecutar: `cd frontend && npx vitest run`
Resultado esperado: todo PASA.

- [ ] **Paso 5: commit**

```bash
git add frontend/src
git commit -m "feat(frontend): menú lateral con secciones que se despliegan"
```

### Tarea 4: menú recogido con ventanita de pantallas

**Archivos:**
- Modificar: `frontend/src/estructura/MenuLateral.tsx`, `frontend/src/index.css`
- Pruebas: `frontend/src/estructura/Estructura.test.tsx`

**Interfaces:**
- Consume: `MenuLateral` de la tarea 3 con `recogido: true`.
- Produce: en modo recogido, el `aside` tiene la clase `menu-lateral--recogido` y mide 56px. Cada sección es un botón solo con su icono y `aria-label` igual a su nombre. Al pasar el ratón o llevar el foco a ese botón se muestra, a su derecha, una lista `role="group"` con `aria-label` igual al nombre de la sección y un enlace por pantalla visible. Inicio es un enlace con icono.

- [ ] **Paso 1: escribir las pruebas que fallan**

- `'recogido, el foco en una sección muestra sus pantallas'`: con `localStorage['puntomoto.menuRecogido']='1'` en `/`, `u.tab()` hasta el botón «Taller» → aparece `getByRole('group', { name: 'Taller' })` con los enlaces de Taller.
- `'recogido, Esc cierra la ventanita y devuelve el foco a la sección'`: con la ventanita de Taller abierta y el foco en uno de sus enlaces, `u.keyboard('{Escape}')` → ya no está el `group` y `document.activeElement` es el botón «Taller».
- `'recogido, elegir una pantalla navega y cierra la ventanita'`: clic en «Mecánicos» del `group` → se ve el `heading` «Mecánicos» y el `group` ya no está.
- `'recogido, pulsar la sección va a su primera pantalla'`: clic en el botón «Compras» → `heading` de la lista de Compras.
- `'Esc en la ventanita no cierra un panel ni el buscador'`: la ventanita solo atiende Esc si el foco está dentro de ella o de su botón.

- [ ] **Paso 2: correr y ver que fallan**

Ejecutar: `cd frontend && npx vitest run src/estructura/Estructura.test.tsx`
Resultado esperado: FALLAN las nuevas.

- [ ] **Paso 3: implementar**

- La ventanita se abre con `onMouseEnter`/`onFocus` y se cierra con `onMouseLeave` o `onBlur` del contenedor (botón + lista), es decir, cuando el foco sale de los dos. También se cierra con Esc y al navegar.
- Posición: `position: absolute` a la derecha del icono, fondo `--marco-elevado` y una sombra discreta, porque flota.
- No usar `title` en lugar de la ventanita.

- [ ] **Paso 4: correr toda la suite**

Ejecutar: `cd frontend && npx vitest run`
Resultado esperado: todo PASA.

- [ ] **Paso 5: commit**

```bash
git add frontend/src
git commit -m "feat(frontend): mostrar las pantallas de cada sección con el menú recogido"
```

### Tarea 5: verificación de la navegación

- [ ] **Paso 1:** `cd frontend && npm run build && npm run lint && npm test`. Resultado esperado: sin errores ni advertencias nuevas, y todas las pruebas pasan.
- [ ] **Paso 2:** `grep -rn "SeccionConPestanas\|ColumnaDeIconos\|PanelContextual\|panel-contextual\|columna__" frontend/src`. Resultado esperado: sin resultados.
- [ ] **Paso 3:** revisión visual con `npm run dev` a 1280 × 800 y 900 × 560, como dueño y como vendedor, con el menú expandido y recogido. Comparar con la opción B de `.superpowers/brainstorm/73643-1794094393/content/menu.html`. Juan lo confirma en la ventana de Tauri en Windows.
- [ ] **Paso 4:** si algo cambia, commit `fix(frontend): ...` con la corrección.

### Tarea 6: retícula, adaptación y piezas compartidas

**Archivos:**
- Modificar: `frontend/src/index.css`. Agregar los tokens `--esp-1: 4px`, `--esp-2: 8px`, `--esp-3: 12px`, `--esp-4: 16px`, `--esp-5: 20px`, `--esp-6: 24px` y `--esp-8: 32px`, y `--fuente-maquina: 'Cascadia Mono', Consolas, monospace`. `#contenido` pasa a `container-type: inline-size` con un ancho máximo de 1600px.
- Crear: `frontend/src/components/EncabezadoDePantalla.tsx`, `FranjaDeIndicadores.tsx`, `BarraDeFiltros.tsx`, `Ficha.tsx`, `EstadoVacio.tsx`
- Crear: `frontend/src/hooks/useAtajo.ts`, `frontend/src/hooks/useAreaAngosta.ts`, `frontend/src/hooks/useConteo.ts`
- Pruebas: `frontend/src/components/Piezas.test.tsx`, `frontend/src/hooks/useAtajo.test.tsx`

**Interfaces:**
- Produce:
  - `EncabezadoDePantalla({ icono, titulo, descripcion, acciones }: { icono: LucideIcon; titulo: string; descripcion: string; acciones?: ReactNode })`: dibuja la placa (`aria-hidden`), un `h2` con el título, la descripción en un `p` y las acciones.
  - `interface Indicador { rotulo: string; valor: ReactNode; alerta?: boolean; cargando?: boolean; error?: boolean }` y `FranjaDeIndicadores({ indicadores }: { indicadores: readonly Indicador[] })`: un `dl`, donde cada celda es `dt` (el rótulo) y `dd` (el valor). Mientras carga, un esqueleto con `aria-busy`; con error, «—» y `title` «No se pudo cargar».
  - `BarraDeFiltros({ busqueda, resultados, children }: { busqueda?: { valor: string; onCambiar: (v: string) => void; placeholder: string; etiqueta: string }; resultados?: number; children?: ReactNode })`, con `role="search"`. La tecla `/` lleva el foco a la búsqueda si el foco no está en un campo. `BotonDeFiltro({ activo, onClick, children })`, con `aria-pressed`.
  - `Ficha({ titulo, onCerrar, acciones, children }: { titulo: string; onCerrar: () => void; acciones?: ReactNode; children: ReactNode })`: si `useAreaAngosta()` es `false`, es un `aside` con `aria-label={titulo}` al lado de la tabla; si es `true`, se dibuja con el `PanelLateral` existente. Esc llama a `onCerrar`.
  - `EstadoVacio({ icono, mensaje, accion }: { icono: LucideIcon; mensaje: string; accion?: ReactNode })`.
  - `useAtajo(tecla: string, alPulsar: () => void, activo = true)`: escucha Ctrl o Cmd más la tecla, con `preventDefault`. No actúa si `hayVentanaAbierta()` o si la tecla se repite.
  - `useAreaAngosta(): boolean`: `true` si `#contenido` mide menos de 1100px. Usa `ResizeObserver` y devuelve `false` si no existe (en las pruebas).
  - `useConteo(queryKey: QueryKey, consulta: (signal: AbortSignal) => Promise<{ count: number }>)`: un `useQuery` que devuelve `count`. Las funciones de `api/` que lo usen aceptan `page_size: 1`.

- [ ] **Paso 1: escribir las pruebas que fallan**

`Piezas.test.tsx`:
- `'el encabezado tiene un h2 con el título y la placa es decorativa'`.
- `'la franja muestra cada rótulo con su valor'` (`getByRole('term')` y `getByRole('definition')`).
- `'un indicador con error muestra una raya y no tumba los demás'`.
- `'el botón de filtro activo tiene aria-pressed'`.
- `'la barra de filtros dice cuántos resultados hay'`: con `resultados={12}`, se ve el texto «12 resultados»; con 1, «1 resultado».
- `'la tecla / enfoca la búsqueda, pero no mientras se escribe en otro campo'`.
- `'la ficha se cierra con Esc'`.
- `'con el área angosta, la ficha se abre como panel lateral'`: simular `ResizeObserver` con 1000px y comprobar `role="dialog"`.
- `'el estado vacío muestra el mensaje y la acción'`.

`useAtajo.test.tsx`:
- `'Ctrl+N llama a la acción'`.
- `'no actúa con un diálogo abierto'`, usando `hayVentanaAbierta`.
- `'no actúa si la tecla se repite'`.

- [ ] **Paso 2: correr y ver que fallan.** Ejecutar `cd frontend && npx vitest run src/components/Piezas.test.tsx src/hooks/useAtajo.test.tsx`. Resultado esperado: FALLAN.
- [ ] **Paso 3: implementar** los componentes, los hooks y sus estilos con los tokens. Los estilos de las tablas van en las clases existentes (`.tabla`, si existe, o una nueva `.tabla-datos`): encabezado fijo, filas de 34px, `.codigo` en letra de máquina, `.etiqueta`, `.medidor` (con `--alerta`) y fila elegida con `aria-selected`.
- [ ] **Paso 4: correr toda la suite.** Ejecutar `cd frontend && npx vitest run`. Resultado esperado: todo PASA.
- [ ] **Paso 5: commit**

```bash
git add frontend/src
git commit -m "feat(frontend): piezas compartidas, retícula y adaptación de las vistas"
```

### Tarea 7: logo sin fondo

**Archivos:**
- Modificar: `frontend/public/logo.png`. Se reemplaza por el PNG transparente de 480 × 469.

- [ ] **Paso 1:** generar el logo con un script de Python en la carpeta temporal de la sesión, sin versionarlo. El método es el de la maqueta:
  - recorrer desde los bordes los píxeles con `max(r, g, b) < 28` que estén conectados al borde;
  - hacerlos transparentes, con un alfa suavizado (`min(255, max(r, g, b) * 9)`) para que no quede halo;
  - no tocar el interior del piñón.
- [ ] **Paso 2:** revisar el resultado sobre fondo negro, blanco y `#ecebe6`, abriendo las tres composiciones como imagen. No debe haber halo negro ni huecos en el piñón.
- [ ] **Paso 3:** comprobar con `sips -g pixelWidth -g pixelHeight -g hasAlpha frontend/public/logo.png` que mide 480 × 469 y que `hasAlpha` es `yes`, y que la esquina (2,2) tiene alfa 0.
- [ ] **Paso 4: commit**

```bash
git add frontend/public/logo.png
git commit -m "style(frontend): logo con fondo transparente"
```

### Tarea 8: acceso en una ventana pequeña

**Archivos:**
- Modificar: `desktop/src-tauri/tauri.conf.json`. La ventana `main` pasa a `width: 760` y `height: 500`, con `resizable: false` y `maximizable: false`, sin `minWidth` ni `minHeight`.
- Modificar: `desktop/src-tauri/capabilities/main.json`. Sumar los permisos `core:window:allow-set-size`, `core:window:allow-set-min-size`, `core:window:allow-set-resizable`, `core:window:allow-set-maximizable` y `core:window:allow-center`.
- Crear: `frontend/src/desktop/useTamanoDeVentana.ts`
- Modificar: `frontend/src/pages/acceso/MarcoDeAcceso.tsx`, `InicioDeSesion.tsx` y `frontend/src/index.css`; el punto de montaje que conoce la fase de la sesión (`App.tsx` o `AuthProvider`)
- Pruebas: `frontend/src/desktop/useTamanoDeVentana.test.ts` y los casos de acceso de `frontend/src/App.test.tsx`

**Interfaces:**
- Produce:
  - `useTamanoDeVentana(conSesion: boolean)`: si `isTauri()`, al pasar a `true` llama, en este orden, a `setResizable(true)`, `setMaximizable(true)`, `setMinSize(new LogicalSize(900, 560))`, `setSize(new LogicalSize(1280, 800))` y `center()`. Al pasar a `false`, primero quita el maximizado si lo hay (`unmaximize`), luego `setMinSize(null)`, `setSize(new LogicalSize(760, 500))`, `setResizable(false)`, `setMaximizable(false)` y `center()`. Fuera de Tauri no hace nada.
  - `MarcoDeAcceso({ titulo, descripcion, children })`, con la misma firma de hoy y el diseño nuevo (sección *Acceso* del diseño).

- [ ] **Paso 1: escribir las pruebas que fallan**
  - `useTamanoDeVentana.test.ts`, simulando `@tauri-apps/api/window` e `isTauri`:
    - `'al abrir la sesión agranda y centra la ventana'`: comprobar las llamadas y su orden.
    - `'al cerrar la sesión vuelve a 760 × 500 sin poder redimensionar'`.
    - `'fuera de Tauri no llama a nada'`.
  - En `App.test.tsx`:
    - `'el inicio de sesión no muestra la versión ni la ayuda de contraseña'`: no está el texto «versión» ni «Olvidaste».
    - `'el inicio de sesión dice si hay conexión'`: se ve «Conectado».
    - `'la contraseña se puede mostrar'`: el botón «Mostrar contraseña» cambia el `type` a `text`.
    - Las pruebas existentes de acceso siguen pasando sin cambiarlas.
- [ ] **Paso 2: correr y ver que fallan.** Ejecutar `cd frontend && npx vitest run src/desktop src/App.test.tsx`.
- [ ] **Paso 3: implementar.**
  - El arte (logo cortado, cuatro líneas de velocidad y degradado) va solo en CSS y en `<img>`, con `aria-hidden`.
  - La entrada de las líneas dura menos de 400ms y no ocurre con `prefers-reduced-motion`.
  - La columna derecha mide 330px y se desplaza si no cabe.
  - El estado de conexión usa `useSalud`.
- [ ] **Paso 4: correr toda la suite.** Resultado esperado: todo PASA.
- [ ] **Paso 5:** comprobar a mano en `npm run dev`, con la ventana del navegador a 760 × 500, que nada se corta. Juan lo comprueba en Tauri en Windows.
- [ ] **Paso 6: commit**

```bash
git add desktop/src-tauri frontend/src
git commit -m "feat(acceso): inicio de sesión en una ventana pequeña con arte propio"
```

### Tarea 9: Inicio con el resumen del día

**Archivos:**
- Modificar: `frontend/src/pages/Inicio.tsx`. Se divide en `pages/inicio/InicioDelDueno.tsx`, `pages/inicio/InicioDelVendedor.tsx` y un componente por instrumento en `pages/inicio/`.
- Crear: `frontend/src/hooks/useVentasDeHoy.ts`
- Pruebas: `frontend/src/pages/inicio/Inicio.test.tsx`

**Interfaces:**
- Consume: `EncabezadoDePantalla`, `useAtajo`, `formatearPesos`, `useCajaActual` y las funciones de `api/` de ventas, liquidación, proveedores, locales y buscador.
- Produce: `useVentasDeHoy(): UseQueryResult<{ cantidad: number; total: number; porHora: { hora: number; total: number }[] }>`. Recorre todas las páginas de `/sales?date_from=hoy&date_to=hoy&voided=false&page_size=200`. `porHora` va de `min(8, primera hora)` a `max(18, última hora)`. La fecha de hoy se calcula en la hora de Colombia, igual que el resto de la app.

- [ ] **Paso 1: escribir las pruebas que fallan**

Dueño:
- `'el dueño ve la caja, las ventas, los mecánicos y las cuentas'`, con datos simulados y cifras con formato: `$ 1.284.000`, «23» y `$ 2.415.000`, `$ 186.000`, `$ 3.920.000`, `$ 640.000`.
- `'con la caja cerrada ofrece abrirla'`.
- `'suma las ventas de todas las páginas'`: dos páginas de 200 y 3 ventas → cantidad 403.
- `'si un dato falla, solo su recuadro muestra el error'`: `/suppliers` responde 500 y los otros tres instrumentos se ven.
- `'las últimas ventas muestran las anuladas tachadas y abren la venta'`.
- `'Nada por pagar hoy cuando no hay servicios pendientes'`.

Vendedor:
- `'el vendedor no ve caja, mecánicos ni cuentas'`: no se piden `/mechanic-settlements/daily`, `/suppliers` ni `/consignees`.
- `'el vendedor consulta precio y existencia'`: escribir «pa» → sale el producto con su precio y sus unidades.

Ambos:
- `'Ctrl+N abre Vender'`.
- `'Inicio no ofrece actualizar el programa'` (ya está en la tarea 2: no duplicarla).

- [ ] **Paso 2: correr y ver que fallan.**
- [ ] **Paso 3: implementar** según la sección *Inicio* del diseño y la maqueta `inicio.html`:
  - los instrumentos en una cuadrícula de 4 columnas, que pasa a 2 × 2 bajo 1100px;
  - un esqueleto de carga por instrumento;
  - `refetchInterval: 60_000` en las consultas de Inicio.
- [ ] **Paso 4: correr toda la suite.** Resultado esperado: todo PASA.
- [ ] **Paso 5: commit**

```bash
git add frontend/src
git commit -m "feat(inicio): resumen del día para el dueño y consulta rápida para el vendedor"
```

### Tareas 10 a 15: las vistas, sección por sección

Las seis tareas siguen el mismo patrón. Cada una toca solo las pantallas de su sección y termina en su propio commit `feat(<sección>): aplicar el diseño de vistas`.

Para cada pantalla de la sección:
1. **Encabezado:** cambiar el título actual por `EncabezadoDePantalla`, con el icono del destino (`DESTINOS.x.icono`), su descripción y las acciones que la pantalla ya tiene.
2. **Indicadores:** agregar la `FranjaDeIndicadores` exactamente como la tabla «Qué lleva cada pantalla» del diseño. Las que dicen «Ninguno» no llevan franja.
3. **Filtros:** pasar los filtros actuales a `BarraDeFiltros`. Las casillas pasan a `BotonDeFiltro`, y las listas desplegables mantienen su `CampoSelector` con el estilo de botón.
4. **Tabla y vacío:** aplicar las clases de tabla, y marcar `col-secundaria` en las columnas que se pueden ocultar en ventanas angostas. Los vacíos usan `EstadoVacio`.
5. **Ficha:** donde la tabla dice «Sí», agregar la `Ficha`. La fila se elige con clic o con las flechas y Enter; si la fila deja de estar en la lista, la ficha se cierra.

**Pruebas de cada tarea:**
- Las pruebas existentes de la sección siguen pasando. Si alguna buscaba un `h1` o un texto que cambió de nivel, se ajusta el selector, nunca la intención.
- Por pantalla con indicadores, una prueba de que muestran la cifra exacta de la fuente indicada.
- Por pantalla con ficha, una prueba de que se abre con clic, se mueve con flechas, se cierra con Esc y se cierra si la fila desaparece al filtrar.
- Una prueba de que el vendedor no ve indicadores ni datos del dueño, como el costo o el margen en la ficha de Productos.

**Las tareas:**
- **Tarea 10 · Mostrador:** Vender (el carrito como recibo y el total en un instrumento negro, sin cambiar el flujo de cobro), Ventas y Devoluciones.
- **Tarea 11 · Inventario:** Productos (ficha con los 5 últimos movimientos de `/inventory/movements?product=<id>&page_size=5`), Movimientos, Inventario inicial y Tipos, marcas y motos.
- **Tarea 12 · Taller:** Liquidación del día, Historial de liquidaciones, Mecánicos y Tipos de servicio.
- **Tarea 13 · Compras:** Compras, Proveedores y Abonos. «Debo en total» suma `balance_due` de `/suppliers`.
- **Tarea 14 · Caja y Consignación:** Caja de hoy, Cajas anteriores, Locales, Entregas, Reportes y Pagos.
- **Tarea 15 · Configuración:** Datos del negocio y Actualizar programa (tarjeta de 640px), y Usuarios.

En cada tarea: escribir las pruebas que fallan, ver que fallan, implementar, correr toda la suite y hacer el commit.

### Tarea 16: verificación final

- [ ] **Paso 1:** `cd frontend && npm run build && npm run lint && npm test`. Resultado esperado: sin errores y todas las pruebas pasan.
- [ ] **Paso 2:** `grep -rnE "margin|padding|gap" frontend/src/index.css | grep -vE "var\(--esp|0\b|auto"`. Resultado esperado: solo excepciones justificadas, como bordes de 1px o 3px. Corregir las demás para que usen la retícula.
- [ ] **Paso 3:** capturas con `npm run dev` de **cada pantalla**:
  - a 900 × 560, 1280 × 800 y 1920 × 1080;
  - como dueño y como vendedor;
  - guardadas en `.superpowers/capturas/`.
- [ ] **Paso 4:** revisar cada captura contra las *Reglas de orden y alineación*: retícula, alturas iguales en cada fila, números a la derecha, nada cortado ni encimado, contraste AA y en 1920 contenido junto al menú. Anotar y corregir cada falla con un commit `fix(<sección>): ...`.
- [ ] **Paso 5:** pedir la revisión cruzada a otra IA (skill `revision-cruzada`) y corregir los hallazgos que se puedan comprobar.
- [ ] **Paso 6:** Juan prueba en Tauri en Windows: el login pequeño, el cambio de tamaño al entrar y al salir, Ctrl+N y una pasada por todas las pantallas.
