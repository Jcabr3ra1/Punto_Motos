# Punto Moto 0.3.0

## Cambios de esta versión

- **Diseño nuevo «Tablero»:** el marco del programa ahora es negro con detalles en lima. Los módulos están en una columna de iconos a la izquierda y, a su lado, un panel con las pantallas del módulo abierto y para qué sirve cada una. `Ctrl+B` recoge o expande ese panel.
- **Buscador de pantallas (`Ctrl+K`):** escribe parte del nombre (sin importar tildes), muévete con las flechas y abre con `Enter`. Solo muestra las pantallas que tu usuario puede abrir.
- **Formularios en un panel lateral:** crear o editar productos, ajustar existencias, proveedores, abonos, gastos y cierre de caja, locales, usuarios, catálogo, servicios, mecánicos y devoluciones se abren desde la derecha sin perder de vista la lista. `Esc` cierra, `Ctrl+Enter` guarda y, si escribiste algo, pregunta antes de descartarlo.
- **Vista previa antes de guardar:** el ajuste muestra cómo quedan las existencias (por ejemplo, `8 → 11`) y el cierre de caja compara el efectivo esperado con el contado.
- **Confirmaciones claras:** eliminar un producto, anular una venta o borrar un borrador de compra se confirman en una ventana pequeña que empieza en «Volver».
- **Inicio renovado:** saludo según la hora, accesos rápidos según el rol y, para el dueño, la caja de hoy con el efectivo esperado.
- **Iconos** en el menú y en los botones principales; tablas y avisos más compactos y legibles.

No cambian el contrato de la API ni el esquema de datos.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
