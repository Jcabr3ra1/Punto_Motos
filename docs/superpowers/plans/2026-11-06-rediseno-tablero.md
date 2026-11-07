# Rediseño «Tablero»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Punto Moto el marco «Tablero» con navegación en dos niveles, iconos, buscador Ctrl+K, panel lateral para los formularios e Inicio con accesos y caja, con aspecto de programa de escritorio.

**Architecture:** `navegacion/destinos.ts` sigue siendo la única fuente de pantallas: se le agregan icono y descripción, y un mapa de submenús por módulo. `estructura/` contiene el marco (columna de iconos, panel contextual, barra superior, buscador). `components/` contiene las piezas emergentes reutilizables (`PanelLateral`, `DialogoDeConfirmacion`, `VistaPrevia`). Cada pantalla sigue con su estado `vista`. Ahora muestra la lista siempre y abre el formulario dentro de `PanelLateral`, en lugar de reemplazar la lista.

**Tech Stack:** React 19, TypeScript, React Router 8 (rutas por hash), TanStack Query 5, Vitest + Testing Library, `lucide-react` 1.61.0, CSS propio en `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-11-06-rediseno-tablero-design.md`

## Global Constraints

- Programa de escritorio, no página web: aplica completa la sección homónima del spec.
- Ventana: 1280 × 800 al abrir; mínimo 900 × 560. Todo cabe y funciona en el mínimo.
- Segoe UI 14px; controles de 32px; esquinas de 4px (6px en el diálogo y el buscador); nada de 12px o más ni píldoras, salvo el indicador de caja.
- Marco `#0b0b0c`; separadores `#1f1f20`; selección en el marco `#1a1c10` con texto lima; filete de 2px lima `#cde409` bajo la barra superior; área de trabajo `#ecebe6`; superficies `#ffffff`.
- El lima solo va como relleno con texto negro o sobre negro. El acento sobre claro es el oliva `#4a5700`.
- Contraste WCAG AA; ningún texto funcional por debajo de 11px. El texto secundario es `#9c9c99` sobre negro y `#5f636a` sobre claro.
- Animaciones de menos de 200ms, que respetan `prefers-reduced-motion`.
- `destinos.ts` es la única fuente de pantallas y permisos.
- Sin cambios en el backend. Inicio solo usa endpoints documentados.
- Código, textos y comentarios en español. Commits en español con Conventional Commits, sin `Co-Authored-By`, y **cada commit con aprobación de Juan**.
- Rama `feat/frontend-rediseno`. Todas las pruebas existentes siguen pasando; no se borran pruebas para que pasen. Si una prueba solo dependía de las pestañas que se quitan, se ajusta para usar el panel contextual.

## Review Focus

- **Vendedor:** ni la columna, ni el panel contextual, ni el buscador, ni Inicio muestran pantallas solo del dueño (tareas 2, 3 y 7).
- **Cambio de pantalla con el panel lateral abierto** (por Ctrl+K o clic en el menú): el panel se cierra y no queda el velo encima (tareas 4 y 5).
- **Formulario con cambios y Esc:** pregunta «¿Descartar los cambios?». Un segundo Esc cierra solo esa pregunta, no el panel (tarea 4).
- **Ctrl+Enter repetido mientras se guarda:** una sola solicitud al servidor (tarea 4, con la protección `isPending` de cada formulario).
- **Ctrl+K con un panel o diálogo abierto:** no abre el buscador encima (tarea 3).

---

### Task 1: Iconos, descripciones y paleta del marco

**Files:**
- Modify: `frontend/package.json` (dependencia exacta `"lucide-react": "1.61.0"`) y `frontend/package-lock.json`
- Modify: `frontend/src/navegacion/destinos.ts`
- Modify: `frontend/src/index.css` (tokens en `:root`)
- Create: `frontend/src/navegacion/destinos.test.ts`

**Interfaces:**
- Produces: en `Destino`, los campos `icono: LucideIcon` y `descripcion: string`. También `SUBMENUS: Readonly<Record<string, readonly Destino[]>>`, indexado por la `ruta` del módulo (`'/venta'` → `MENU_VENTA`, `'/compras'`, `'/caja'`, `'/consignacion'`, `'/taller'`, `'/configuracion'` → `MENU_CONFIGURACION`), y `pantallasDe(modulo: Destino, rol: Role): readonly Destino[]`, que devuelve el submenú filtrado por rol, o `[modulo]` si el módulo no tiene submenú.
- Tokens CSS: `--marco`, `--marco-separador`, `--marco-seleccion`, `--marco-texto`, `--marco-texto-suave`, `--fondo-trabajo`. Los valores son los de Global Constraints.

- [ ] **Step 1: Crear la rama**: `git switch -c feat/frontend-rediseno` desde `main` actualizado.
- [ ] **Step 2: Escribir las pruebas que fallan** en `destinos.test.ts`:
  - `cada destino tiene icono y descripción`: para todo `Object.values(DESTINOS)`, `typeof d.icono` es `'object'` o `'function'` y `d.descripcion.length > 0`.
  - `pantallasDe filtra por rol`: `pantallasDe(DESTINOS.compras, 'seller')` es `[]`, y `pantallasDe(DESTINOS.venta, 'seller')` es `[DESTINOS.vender, DESTINOS.ventas]`.
  - `módulo sin submenú se devuelve solo`: `pantallasDe(DESTINOS.productos, 'owner')` es `[DESTINOS.productos]`.
- [ ] **Step 3: Ejecutar** `npm test -- destinos`. Debe fallar porque no existen `icono` ni `pantallasDe`.
- [ ] **Step 4: Implementar.** Instalar con `npm i -E lucide-react@1.61.0`. Agregar el icono y la descripción a cada destino: una frase corta en el tono del panel («Carrito y cobro», «Existencias y precios»). Agregar `SUBMENUS`, `pantallasDe` y los tokens CSS.
- [ ] **Step 5: Ejecutar** `npm test` y `npm run lint` dentro de `frontend/`: todo en verde.
- [ ] **Step 6: Commit** (con aprobación): `feat(frontend): agregar iconos y descripciones a las pantallas`

### Task 2: Marco con columna de iconos y panel contextual

**Files:**
- Create: `frontend/src/estructura/ColumnaDeIconos.tsx`, `frontend/src/estructura/PanelContextual.tsx`, `frontend/src/estructura/useMenuRecogido.ts`, `frontend/src/estructura/Estructura.test.tsx`
- Modify: `frontend/src/estructura/Estructura.tsx`, `frontend/src/components/SeccionConPestanas.tsx` (quitar las pestañas y conservar `h1` y `Outlet`), `frontend/src/index.css`
- Modify si alguna falla por las pestañas: `frontend/src/Rutas.test.tsx` y las pruebas de páginas que hacían clic en una pestaña

**Interfaces:**
- Consumes: `MENU_PRINCIPAL`, `pantallasDe`, `puedeVer` y los campos `icono` y `descripcion` (tarea 1).
- Produces: `useMenuRecogido(): { recogido: boolean; alternar: () => void }`, guardado en `localStorage` con la clave `'puntomoto.menuRecogido'` (`'1'` o `'0'`, protegido con try/catch). La columna es `<nav aria-label="Principal">`, con un enlace por módulo cuyo nombre accesible es la `etiqueta`. El panel es `<nav aria-label={modulo.etiqueta}>` con enlaces a sus pantallas.

- [ ] **Step 1: Escribir las pruebas que fallan** en `Estructura.test.tsx`, montando con `mostrarRutas`:
  - `el vendedor no ve módulos del dueño`: dentro de `navigation 'Principal'` no hay enlaces `Compras`, `Caja`, `Consignación` ni `Taller`.
  - `el panel contextual muestra las pantallas del módulo actual`: en `/compras/proveedores` como dueño, `navigation 'Compras'` contiene los enlaces `Compras`, `Proveedores` y `Abonos`, y `Proveedores` tiene `aria-current="page"`.
  - `Ctrl+B recoge el panel y se recuerda`: `user.keyboard('{Control>}b{/Control}')` hace que `navigation 'Compras'` no esté en el documento y que `localStorage['puntomoto.menuRecogido'] === '1'`. Al desmontar y volver a montar, sigue recogido.
  - `la columna sigue visible recogida`: tras Ctrl+B, el enlace `Inicio` de `navigation 'Principal'` sigue presente.
- [ ] **Step 2: Ejecutar** `npm test -- Estructura`. Debe fallar.
- [ ] **Step 3: Implementar** la columna (unos 62px), el panel (unos 190px) y el cableado en `Estructura.tsx`. El módulo actual se elige con la ruta más larga de `MENU_PRINCIPAL` que coincide, la misma regla de `ubicacionDe`. Por debajo de 1000px de ancho, `matchMedia('(max-width: 1000px)')` recoge el panel por defecto, sin cambiar la preferencia guardada. Al recogerse, el marco se ajusta con `grid-template-columns`, sin animar el ancho. Los estilos van en `index.css` con la paleta del marco.
- [ ] **Step 4: Ejecutar** `npm test`: las pruebas nuevas y todas las existentes en verde. Si una prueba antigua buscaba una pestaña por su nombre, se cambia para buscarla en el panel contextual.
- [ ] **Step 5: Commit** (con aprobación): `feat(frontend): marco tablero con columna de iconos y panel contextual`

### Task 3: Barra superior Tablero y buscador Ctrl+K

**Files:**
- Create: `frontend/src/navegacion/buscar.ts`, `frontend/src/navegacion/buscar.test.ts`, `frontend/src/estructura/Buscador.tsx`, `frontend/src/estructura/Buscador.test.tsx`
- Modify: `frontend/src/estructura/BarraSuperior.tsx`, `frontend/src/estructura/Estructura.tsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `DESTINOS`, `SUBMENUS`, `puedeVer`.
- Produces: `buscarPantallas(texto: string, rol: Role, conteoAbierto: boolean): { destino: Destino; modulo: Destino }[]`, que normaliza sin tildes ni mayúsculas, compara contra la etiqueta y la descripción, y excluye `inventarioInicial` si `conteoAbierto` es falso. `Estructura.tsx` le pasa el valor de `useConteoInicial`. También `Buscador({ onCerrar }: { onCerrar: () => void })`, un `role="dialog"` con `aria-label="Buscar pantalla"`, que contiene un `combobox` y un `listbox`.

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - `buscar.test.ts`:
    - `buscarPantallas('liquidacion', 'owner', false)` devuelve `liquidacion` con el módulo `taller`.
    - `buscarPantallas('PROVEE', 'owner', false)` devuelve `proveedores`.
    - `buscarPantallas('compras', 'seller', false)` es `[]`.
    - `buscarPantallas('inventario inicial', 'owner', false)` es `[]`.
  - `Buscador.test.tsx`, montando con `mostrarRutas`:
    - `Ctrl+K abre el buscador y Enter navega`: escribir «abonos», pulsar `{Enter}`, y el panel contextual `Compras` marca `Abonos` con `aria-current="page"` y el diálogo desaparece.
    - `flechas mueven la opción activa`: `aria-activedescendant` cambia con `{ArrowDown}`.
    - `Esc cierra y devuelve el foco` al elemento que tenía el foco antes.
    - `Ctrl+K no abre con un diálogo abierto`: con un `role="dialog"` ya montado, Ctrl+K no agrega un segundo diálogo.
- [ ] **Step 2: Ejecutar** `npm test -- buscar Buscador`. Debe fallar.
- [ ] **Step 3: Implementar.**
  - **Barra superior:** negra con filete lima de 2px; migas «Módulo › Pantalla»; botón «Buscar pantalla…» con `<kbd>Ctrl K</kbd>`; pastilla de caja verde; hora en lima con `font-variant-numeric: tabular-nums`; círculo lima con las iniciales; Cerrar sesión con icono `LogOut`. Se conserva `data-tauri-drag-region`.
  - **Buscador:** ventana centrada de 6px de radio sobre un velo `rgba(8,8,9,.55)`; cada resultado lleva icono, «Módulo › Pantalla» y la descripción. El atajo se registra en `Estructura.tsx` en fase de captura, como en AVISENS.
- [ ] **Step 4: Ejecutar** `npm test` y `npm run lint`: todo en verde.
- [ ] **Step 5: Commit** (con aprobación): `feat(frontend): barra superior tablero y buscador de pantallas`

### Task 4: Panel lateral, diálogo de confirmación y vista previa

**Files:**
- Create: `frontend/src/components/PanelLateral.tsx`, `frontend/src/components/DialogoDeConfirmacion.tsx`, `frontend/src/components/VistaPrevia.tsx`, `frontend/src/components/useFocoAtrapado.ts`, `frontend/src/components/Emergentes.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces:
  - `PanelLateral(props: { titulo: string; modulo: string; descripcion?: string; ancho?: 'normal' | 'ancho'; onCerrar: () => void; children: ReactNode })`:
    - Se monta en un portal a `document.body` como `role="dialog"`, `aria-modal="true"` y `aria-labelledby` apuntando al título.
    - Mide 400px (`normal`) o 560px (`ancho`), anclado a la derecha bajo la barra superior.
    - El cuerpo tiene scroll propio, y `.acciones` del formulario hijo queda fija abajo con `position: sticky; bottom: 0`.
    - **Ctrl+Enter** llama a `requestSubmit()` del primer `form` interno.
    - Se marca «con cambios» al primer evento `input` o `change` dentro del panel. Con cambios, Esc, el botón cerrar o el clic en el velo abren `DialogoDeConfirmacion` («¿Descartar los cambios?», acción «Descartar»). Sin cambios, cierra de inmediato.
    - Al montar enfoca el primer campo, y al desmontar devuelve el foco al elemento anterior.
  - `DialogoDeConfirmacion(props: { titulo: string; children?: ReactNode; accion: string; peligro?: boolean; ocupado?: boolean; onConfirmar: () => void; onCancelar: () => void })`: ventana centrada de 6px de radio con cabecera negra. El foco inicial va a «Cancelar», Esc cancela, y con `peligro` el botón de la acción usa `boton--peligro`.
  - `VistaPrevia(props: { etiqueta: string; antes: string; despues: string })`: franja negra con `antes` tachado y `despues` en lima; su texto accesible es «{etiqueta}: de {antes} a {despues}».
  - `useFocoAtrapado(ref: RefObject<HTMLElement | null>, activo: boolean): void`, que lo usan los tres emergentes.

- [ ] **Step 1: Escribir las pruebas que fallan** en `Emergentes.test.tsx`, con un formulario de prueba que tiene un campo `Nombre` y un `onSubmit` espía:
  - `abre con el foco en el primer campo` y `devuelve el foco al botón que lo abrió al cerrar`.
  - `Tab no sale del panel`: tras el último control, el foco vuelve al primero.
  - `Esc sin cambios cierra`: `onCerrar` se llama una vez.
  - `Esc con cambios pregunta`: tras escribir en `Nombre`, Esc muestra `dialog '¿Descartar los cambios?'`. Un segundo Esc cierra solo la pregunta, el panel sigue y `onCerrar` no se llamó. «Descartar» llama a `onCerrar`.
  - `Ctrl+Enter envía el formulario`: el `onSubmit` espía se llama una vez.
  - `DialogoDeConfirmacion` empieza con el foco en `Cancelar`, y Esc llama a `onCancelar`.
  - `VistaPrevia` tiene el nombre accesible «Existencias: de 12 a 15».
- [ ] **Step 2: Ejecutar** `npm test -- Emergentes`. Debe fallar.
- [ ] **Step 3: Implementar** los tres componentes y su CSS.
  - **Panel:** sin radio y con la línea lima de 3px a la izquierda.
  - **Cabecera:** módulo en oliva, mayúsculas, 11px.
  - **Pie:** ayuda `<kbd>Esc</kbd>` y `<kbd>Ctrl ↵</kbd>`.
  - **Entrada:** `translateX` en 180ms, desactivada con `prefers-reduced-motion`.
- [ ] **Step 4: Ejecutar** `npm test` y `npm run lint`: todo en verde.
- [ ] **Step 5: Commit** (con aprobación): `feat(frontend): panel lateral y diálogo de confirmación reutilizables`

### Task 5: Formularios de productos, inventario y compras en el panel

**Files:**
- Modify: `frontend/src/pages/productos/Productos.tsx`, `ListaDeProductos.tsx` (la confirmación de eliminar pasa a `DialogoDeConfirmacion`)
- Modify: `frontend/src/pages/inventario/Movimientos.tsx`, `FormularioDeAjuste.tsx` (agrega `VistaPrevia` «Existencias»), `ConsumoDelTaller.tsx` y la pantalla que lo abre
- Modify: `frontend/src/pages/compras/Proveedores.tsx`, `Abonos.tsx`, `DetalleDeCompra.tsx` (el abono va en el panel; la compra sigue en pantalla completa)
- Modify (ajustar a la lista visible detrás): `Productos.test.tsx`, `Movimientos.test.tsx`, `Proveedores.test.tsx`, `Abonos.test.tsx`, `Compras.test.tsx`

**Interfaces:**
- Consumes: `PanelLateral`, `DialogoDeConfirmacion` y `VistaPrevia` (tarea 4).
- Patrón para cada pantalla: la lista se renderiza siempre. Si `vista.tipo !== 'lista'`, además se renderiza `<PanelLateral titulo=… modulo=… onCerrar={() => volver()}>` con el formulario existente dentro. El formulario conserva sus props `onTerminar` y `onCancelar`. Se quita el `Titulo` que el formulario tenía en pantalla completa, porque el panel ya lo muestra.

- [ ] **Step 1: Escribir las pruebas que fallan,** una por pantalla, en su archivo de pruebas:
  - `Nuevo producto abre un panel y la lista sigue detrás`: `dialog 'Nuevo producto'` está visible y la `table` sigue en el documento.
  - `ajuste muestra la vista previa`: con el producto `stock: 12`, escribir 3 en «Entran» muestra «Existencias: de 12 a 15». Con «Salen» y 5 muestra «de 12 a 7».
  - `eliminar producto pide confirmación en un diálogo`: `dialog '¿Eliminar «…»?'` muestra el foco en `Cancelar`.
  - `registrar abono abre un panel` en Proveedores y en Abonos.
  - **Review Focus:** `cambiar de pantalla cierra el panel`. Con el panel de nuevo producto abierto, un clic en `Movimientos` de `navigation 'Principal'` hace que no haya ningún `dialog`.
- [ ] **Step 2: Ejecutar** las pruebas de esas pantallas. Deben fallar.
- [ ] **Step 3: Implementar** el patrón en cada pantalla de la lista de archivos.
- [ ] **Step 4: Ejecutar** `npm test`. Las pruebas existentes que esperaban que la lista desapareciera al abrir el formulario se ajustan buscando dentro del `dialog`, sin quitar lo que verifican.
- [ ] **Step 5: Commit** (con aprobación): `feat(frontend): abrir formularios de productos, inventario y compras en panel`

### Task 6: Formularios de caja, consignación, configuración y devolución en el panel

**Files:**
- Modify: `frontend/src/pages/caja/CajaDeHoy.tsx`:
  - Abrir caja, gasto, retiro y cierre van en el panel.
  - El cierre lleva `VistaPrevia` «Diferencia», de `esperado` a `contado`, con el signo y el texto «sobra» o «falta».
- Modify: `frontend/src/pages/consignacion/Locales.tsx` (nuevo y editar local), `PagosDeLocales.tsx` (pago). Entregas y Reportes siguen en pantalla completa.
- Modify: `frontend/src/pages/configuracion/usuarios/Usuarios.tsx`, `catalogo/Catalogo.tsx` o `ListaDeCatalogo.tsx`, `taller/TiposDeServicio.tsx`, `taller/Mecanicos.tsx`
- Modify: `frontend/src/pages/venta/DetalleDeVenta.tsx`:
  - La devolución va en un panel con `ancho="ancho"`.
  - Anular venta pasa a `DialogoDeConfirmacion` con `peligro`.
- Modify: `frontend/src/pages/compras/FormularioDeCompra.tsx`: la confirmación en línea de borrar el borrador pasa a `DialogoDeConfirmacion`.
- Modify las pruebas correspondientes: `Caja.test.tsx`, `Consignacion.test.tsx`, `Taller.test.tsx`, las pruebas de usuarios y catálogo que existan, `Devoluciones.test.tsx` y `Ventas.test.tsx`.

**Interfaces:**
- Consumes: el mismo patrón y los mismos componentes de las tareas 4 y 5.

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - `gasto abre panel con la caja visible detrás`.
  - `cierre muestra la diferencia`: esperado $412.000 y contado $410.000 muestra «Diferencia: de $ 412.000 a $ 410.000» y «falta $ 2.000».
  - `devolución abre un panel ancho`: el `dialog` tiene la clase `panel-lateral--ancho`.
  - `anular venta pide confirmación con botón de peligro`.
  - `nuevo usuario abre panel` y `nuevo mecánico abre panel`.
- [ ] **Step 2: Ejecutar** las pruebas de esas pantallas. Deben fallar.
- [ ] **Step 3: Implementar** el patrón en cada pantalla.
- [ ] **Step 4: Ejecutar** `npm test` y `npm run lint`: todo en verde.
- [ ] **Step 5: Commit** (con aprobación): `feat(frontend): abrir formularios de caja, consignación, configuración y devolución en panel`

### Task 7: Inicio con accesos rápidos y caja de hoy

**Files:**
- Modify: `frontend/src/pages/Inicio.tsx`, `frontend/src/desktop/Actualizaciones.tsx` (solo los estilos), `frontend/src/index.css`
- Create: `frontend/src/pages/Inicio.test.tsx`

**Interfaces:**
- Consumes: `DESTINOS` con su icono y descripción, `puedeVer`, `useCajaActual()` (`CurrentCash`: `is_open`, `session?.expected_cash`, `session?.opening_cash` y `session?.opened_at`) y `formatearPesos`.
- Produces: `saludoSegunHora(fecha: Date): 'Buenos días' | 'Buenas tardes' | 'Buenas noches'`, exportada para probarla. Va hasta las 11:59, hasta las 18:59, y el resto.

- [ ] **Step 1: Escribir las pruebas que fallan:**
  - `saludoSegunHora`: 8:00 da «Buenos días», 15:00 da «Buenas tardes» y 20:00 da «Buenas noches».
  - `el vendedor ve Vender y Productos, sin caja ni liquidación`.
  - `el dueño ve la caja abierta con el esperado y la apertura`: `$ 412.000`, y apertura `$ 100.000`.
  - `con la caja cerrada, el dueño ve Abrir caja`, que enlaza a `/caja/actual`.
  - `Nueva venta enlaza a /venta/vender`.
- [ ] **Step 2: Ejecutar** `npm test -- Inicio`. Debe fallar.
- [ ] **Step 3: Implementar.**
  - **Encabezado:** saludo con nombre y rol (h1 de 20px) y el botón lima «Nueva venta» con el icono `Plus`.
  - **Accesos rápidos:** una fila de tarjetas de unos 80px de alto, con borde superior lima y esquinas de 4px.
  - **Tarjeta de caja:** negra, con la cifra en lima.
  - **Actualizaciones:** se restilizan.
  - Solo se usan los campos listados. Lo que no venga no se muestra.
- [ ] **Step 4: Ejecutar** `npm test`: todo en verde.
- [ ] **Step 5: Commit** (con aprobación): `feat(frontend): inicio con accesos rápidos y caja de hoy`

### Task 8: Pulido de componentes compartidos y verificación visual

**Files:**
- Modify: `frontend/src/index.css` (botones, campos, tablas, avisos, estados vacíos y de carga) y los componentes de `frontend/src/components/` que necesiten icono (`EstadoDeCarga`, `AvisoDeError`, `Paginacion`)
- Modify: los botones de acción principal de las pantallas (Nuevo producto, Nuevo proveedor, Registrar abono, Nueva compra, etc.), que reciben su icono `lucide-react` de 16px

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Botones con icono e icono más texto.** Un botón con solo icono lleva `aria-label`.
- [ ] **Step 2: Tablas.** Filas de unos 32px, encabezado gris `#5f636a` en mayúsculas de 11px, número alineado a la derecha con cifras tabulares y fila resaltada al pasar el mouse.
- [ ] **Step 3: Avisos y estados vacíos.** Icono a la izquierda y colores de los tokens existentes.
- [ ] **Step 4: Ejecutar** `npm test`, `npm run lint` y `npm run build` dentro de `frontend/`: todo en verde.
- [ ] **Step 5: Verificación visual.** Con `npm run dev`, abrir la app en el navegador a 1280 × 800 y a 900 × 560, con el menú expandido y recogido, como dueño y como vendedor. Revisar Inicio, Productos con el panel abierto, Caja con el cierre, el buscador y la confirmación de eliminar. Comprobar cada punto de la sección «Programa de escritorio, no página web» del spec. Juan hace la comprobación final en la ventana de Tauri en Windows.
- [ ] **Step 6: Recorrido solo con teclado:** Ctrl+K, Ctrl+B, abrir un panel, Esc con cambios y Ctrl+Enter.
- [ ] **Step 7: Commit** (con aprobación): `style(frontend): pulir botones, tablas y avisos con el estilo tablero`
- [ ] **Step 8: Cierre.** quality-gate, una revisión de otra IA según la guía global, y luego push y PR con la aprobación de Juan.
