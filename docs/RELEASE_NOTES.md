# Punto Moto 0.6.1

## Cambios de esta versión

- **Corrige enlaces en tarjetas oscuras de Inicio:** los botones como «Ver ventas de hoy →» y «Ver mes en ventas →» conservan el fondo oscuro en reposo y pasan a texto oscuro sobre fondo lima al pasar el mouse, restaurando el contraste en tarjetas oscuras.

No cambian el contrato de la API ni el esquema de datos (`0.11.0`).

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
