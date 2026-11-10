# Punto Moto 0.5.2

## Cambios de esta versión

- **Corrige la 0.5.1:** esa versión salió con casi todos los estilos de la aplicación perdidos (Inicio y el resto de pantallas se veían sin diseño). Esta versión los restaura. Si instalaste la 0.5.1, actualiza a la 0.5.2.
- **Crear proveedor desde la compra:** en Nueva compra, «Crear proveedor nuevo» abre el formulario del proveedor; al guardarlo queda elegido y no se pierde lo ya escrito en la compra.
- **Pagos de locales:** al registrar el pago de un local solo salen los que deben algo.
- **Devoluciones:** el botón «Nueva devolución» lleva a Ventas e indica cómo registrarla desde el recibo de la venta.
- **Tipos, marcas y motos:** las tres listas son pestañas grandes arriba, con su cantidad, y Ctrl+N crea en la sección elegida.
- **Teclas rápidas más visibles:** las etiquetas de atajo (como Ctrl+N) y la tecla de la barra superior se ven con más contraste.

No cambian el contrato de la API ni el esquema de datos.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
