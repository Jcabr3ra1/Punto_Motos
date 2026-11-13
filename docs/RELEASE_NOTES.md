# Punto Moto 0.6.0

## Cambios de esta versión

- **Resumen de ventas (solo dueño):** nueva pantalla **Mostrador → Resumen de ventas** con totales netos, desglose por tipo de producto, servicio realizado y producto vendido en el período elegido, descontando anulaciones y devoluciones.
- **Exportar a Excel (`.xlsx`):** botón **Exportar Excel** en Resumen de ventas, Ventas, Productos, Cajas anteriores e Historial de liquidaciones para descargar reportes completos en formato `.xlsx`.
- **Liquidación del día más clara e interactiva:** cada mecánico muestra en su fila los servicios realizados y abre una ventana interactiva con el detalle de cada servicio, su mano de obra, descuentos aplicados, medio de pago y confirmación de pago.
- **Eliminar mecánicos:** en Configuración → Taller → Mecánicos se pueden eliminar mecánicos que aún no tengan historial; si ya tienen servicios, liquidaciones o descuentos, se ofrece desactivarlos directamente.
- **Diferencia en cierre de caja:** al cerrar caja con descuadre, la explicación registrada (`closing_notes`) se muestra de forma visible en el aviso posterior, en el resumen de la caja y en el historial.
- **Tabla de productos y catálogo:** en la tabla de Productos se muestra solo la existencia actual (sin el mínimo); y en Catálogo se amplían las descripciones de tipos, marcas y motos con ejemplos de siglas.
- **Visibilidad y respuesta visual:** enlaces de navegación en Inicio más visibles, botones y filtros con iluminación clara al pasar el mouse y mensaje aclaratorio de uso local sin internet al iniciar la aplicación.

No cambia el esquema de datos ni la versión de la base (`0.11.0`); se añaden `GET /sales/summary`, `DELETE /mechanics/{id}` y el detalle `services` en `GET /mechanic-settlements/daily`.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
