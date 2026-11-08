# Punto Moto 0.4.0

## Cambios de esta versión

- **Entrar en una ventana pequeña:** el programa abre en una ventana de 760 × 500 con el logo y el estado de la conexión; al iniciar sesión crece al tamaño de trabajo (1280 × 800) y al salir vuelve a la ventana pequeña. La contraseña se puede mostrar u ocultar.
- **Menú por secciones:** cada sección (Mostrador, Inventario, Taller, Compras, Caja, Consignación) se despliega con sus pantallas debajo; solo queda abierta la de la pantalla actual. Tipos, marcas y motos pasa a Inventario; Mecánicos y Tipos de servicio, a Taller. Configuración queda al pie con Datos del negocio, Usuarios y **Actualizar programa** (antes en Inicio). Con `Ctrl+B` el menú queda en iconos y cada sección muestra sus pantallas al pasar el ratón o el teclado.
- **Inicio con el resumen del día:** el dueño ve la caja, las ventas de hoy con un gráfico por hora, lo que se les debe a los mecánicos, lo que se debe a proveedores y lo que deben los locales, y las últimas ventas. El vendedor puede consultar precio y existencia sin entrar a Productos.
- **Pantallas renovadas:** cada pantalla tiene su encabezado, cifras clave exactas (por ejemplo, ventas de hoy, productos activos, borradores o lo que se debe), y en Ventas, Devoluciones, Productos, Historial de liquidaciones y Cajas anteriores una ficha a la derecha con el detalle del elemento elegido (flechas para recorrer, `Esc` para cerrar). La existencia se ve como un medidor que se pone naranja cuando hay que reponer.
- **`Ctrl+N`** abre «Nueva venta» o el formulario «Nuevo…» de la pantalla en la que estás.
- **Logo sin fondo** y diseño alineado que se adapta a ventanas desde 900 × 560 hasta pantallas grandes.

No cambian el contrato de la API ni el esquema de datos.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
