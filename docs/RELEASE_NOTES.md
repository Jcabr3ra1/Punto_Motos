# Punto Moto 0.5.0

## Cambios de esta versión

- **Inicio como panorama del negocio:** el dueño ve primero cómo va todo: lo vendido hoy frente a ayer, los últimos 7 días y el mes frente al mes anterior, lo que hay en caja, la tendencia de ventas, lo que deben los locales y lo que se debe a proveedores y mecánicos, y un bloque **Necesita tu atención** (caja sin abrir o de otro día, mecánicos por liquidar, compras en borrador y productos agotados), con la caja de hoy, las existencias por reponer y las devoluciones del día.
- **Vender como punto de venta:** buscador y venta en curso a la izquierda y caja registradora negra a la derecha, con billetes rápidos y vuelto. Los servicios se agregan en una ventana propia, el pago puede ser mixto (efectivo y transferencia o Nequi) y la venta registrada se muestra en una ventana emergente.
- **Listas más cómodas:** Ventas, Devoluciones, Productos, Movimientos, Compras, Proveedores, Abonos, Historial de liquidaciones, Cajas anteriores, Locales, Entregas, Reportes, Pagos de los locales, Usuarios y los catálogos muestran las filas que caben en la pantalla, con **Atrás** y **Siguiente** siempre abajo, filtros como botones (período, estado y listas) y búsqueda con la tecla `/`. Donde cada fila tiene detalle, un panel negro a la derecha lo muestra al elegirla.
- **Documentos sin salir de la lista:** el recibo de una venta, el comprobante de una devolución, la hoja de liquidación, el estado de cuenta de un proveedor y una caja anterior se abren en una ventana emergente. Abrir una compra la muestra en un panel amplio, donde se edita, se recibe o se le abona.
- **Caja de hoy renovada:** el cajón con el efectivo esperado y su desglose, los movimientos paginados y el resumen por tipo en el panel negro.
- **Liquidación del día** con un panel de pago a la derecha; Nueva compra, Nueva entrega y Nuevo reporte se abren en un panel amplio sobre su lista y «Cancelar» pregunta antes de descartar.
- **Locales** muestran lo que debe cada uno y la mercancía que tiene, y se puede registrar su pago desde ahí.
- **Ventana de acceso** con el logo centrado y un saludo; la ventana ya no se desplaza entera al usar la rueda: solo se desplaza su contenido.

No cambian el contrato de la API ni el esquema de datos.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
