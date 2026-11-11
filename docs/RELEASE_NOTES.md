# Punto Moto 0.5.3

## Cambios de esta versión

- **Abrir la caja:** con la caja cerrada, la pantalla es ahora una sola tarjeta con el campo grande de efectivo del cajón, el sugerido del último cierre (con «Usar» para volver a él) y el botón «Abrir caja». Desaparecen los avisos repetidos y el panel negro.
- **Servicios de la venta:** la columna «Qué se hizo» ocupa el ancho libre, trae un ejemplo y muestra un contador de 120 caracteres cerca del límite.

No cambian el contrato de la API ni el esquema de datos.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Datos separados de la instalación e instancia única.
- Búsqueda de actualizaciones desde Inicio para el dueño; descarga e instalación solo tras confirmar.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS, respaldos externos y cierres/reportes mensuales. El respaldo previo a migraciones no sustituye las copias externas del negocio.
