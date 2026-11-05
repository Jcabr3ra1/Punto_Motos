# Punto Moto 0.1.1

## Cambios de esta versión

- El instalador y el desinstalador muestran el logo de Punto Moto en lugar del icono predeterminado de NSIS.
- El asistente de instalación incorpora el logo en su cabecera y panel lateral.
- Los iconos de la aplicación se generan desde el logo original de mayor resolución.

No cambian el contrato de la API ni el esquema de datos.

## Funciones de la versión inicial

Primera versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, caja, consignaciones y taller según los módulos actuales.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Versión inicial para pruebas del proyecto. Aún están pendientes impresión ESC/POS, respaldos externos, devoluciones parciales y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
