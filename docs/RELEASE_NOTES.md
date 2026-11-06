# Punto Moto 0.2.0

## Cambios de esta versión

- **Devoluciones parciales y totales (`Venta → Ventas` y `Venta → Devoluciones`):** permite devolver unidades pendientes de productos indicando su estado (`Vuelve al inventario` o `No puede volver`) y servicios completos, elegir la causa (`Otra causa` o, para el dueño, `Mal servicio del mecánico`), indicar el motivo y repartir el reembolso desde la caja abierta en efectivo, transferencia o mixto.
- **Descuentos a mecánicos por mal servicio (`Taller → Liquidación del día`):** las devoluciones por mal servicio generan un cargo al mecánico que se resta automáticamente en sus próximas liquidaciones diarias (más antiguos primero), mostrando su parte, el descuento aplicado, el neto a pagar (incluso cuando queda en `$0`) y la tabla de saldos pendientes por descontar.
- **Eliminación de productos sin historial (`Productos`):** el dueño puede eliminar definitivamente un producto que nunca se haya usado (`DELETE /products/{id}`); si ya tiene historial, el programa informa el motivo y ofrece desactivarlo ahí mismo.
- **Ventas más ágiles:** el cliente y la descripción adicional del servicio ya no son obligatorios al cobrar en mostrador.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
