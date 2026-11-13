# Punto Moto 0.6.4

## Cambios de esta versión

- **Panel de notificaciones corregido:** se corrigieron el contraste y el fondo sólido del desplegable de notificaciones para que todas las alertas y productos por acabarse se lean con claridad sin superponerse con el contenido de la pantalla.
- **Mejor ubicación de notificaciones:** el botón de la campana ahora se ubica en la esquina derecha de la barra superior junto a **Cerrar sesión**, con el resto de acciones de la cuenta.
- **Diseño responsive para todo tipo de pantallas y resoluciones:** la ventana inicial y su tamaño mínimo (`640×500`) se adaptan a pantallas compactas (`1280×720`, `1366×768` o con escala de Windows de 125%–150%), ventanas divididas y monitores amplios (`1920×1080`, `2560×1440+`), reordenando columnas, barra lateral, barra superior y modales sin recortes.

Incluye las mejoras de `0.6.3` (trabajo sin internet, copias de seguridad SQLite descargables, notificaciones y recuento mensual en Excel).

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte ni depender de internet para operar.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Notificaciones rápidas de inventario y avisos operativos desde la barra superior.
- Copias de seguridad SQLite descargables para respaldo externo y recuento mensual consolidado en `.xlsx`.
- Datos separados de la instalación, instancia única y búsqueda de actualizaciones desde Inicio para el dueño.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS y restaurar copias externas directamente desde la interfaz.
