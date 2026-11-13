# Punto Moto 0.6.2

## Cambios de esta versión

- **Alineación simétrica en Inicio:** el tablero del dueño ahora organiza sus tarjetas en cuatro filas emparejadas de igual altura (Vendido hoy, Vendido este mes y Caja en una sola franja superior; Cómo vienen las ventas con Necesita tu atención; Cuentas del negocio con Devoluciones de hoy en tres tercios iguales; Últimas ventas con Existencias por reponer abajo), con cabeceras, franjas superiores y pies uniformes.
- **Vista del vendedor:** las tarjetas de Consulta de precios y Ventas de hoy comparten ahora altura y remate visual consistente.

No cambian el contrato de la API ni el esquema de datos (`0.11.0`).

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
