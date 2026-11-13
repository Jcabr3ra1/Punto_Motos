# Punto Moto 0.6.3

## Cambios de esta versión

- **Trabajo sin internet sin bloqueos:** las consultas y formularios locales ya no se quedan en *Cargando…* ni *Guardando…* cuando el computador pierde la conexión a internet. Todos los movimientos se guardan al instante en el SQLite local de tu equipo.
- **Copias de seguridad descargables:** nueva pantalla **Configuración → Copias de seguridad** para que el dueño descargue en cualquier momento una copia `.sqlite3` verificada (`PRAGMA integrity_check`) y la conserve fuera del equipo (USB, otro disco o nube), con registro de la última descarga (`last_backup_at`).
- **Botón de notificaciones en la barra superior:** nueva campanita con contador que alerta al equipo sobre productos agotados o en stock mínimo y, al dueño, sobre copias de seguridad faltantes o vencidas (≥ 7 días), caja abierta de un día anterior, mecánicos por liquidar y compras en borrador.
- **Recuento mensual diseñado en Excel (`.xlsx`):** nueva sección en **Mostrador → Resumen** que consulta `GET /api/v1/reports/monthly` y genera un libro `.xlsx` de 5 hojas con formato corporativo (*Resumen del mes*, *Por día*, *Tipos y servicios*, *Productos vendidos* y *Por reponer*).

Incluye migración del backend (`core.0003_businesssettings_last_backup_at`) con respaldo automático previo a la migración al iniciar el programa actualizado.

## Funciones disponibles

Versión instalable para Windows de 64 bits.

- Interfaz de escritorio integrada con Django (`0.11.0`) y SQLite local, sin instalar Python aparte ni depender de internet para operar.
- Acceso por usuario y rol; catálogo, inventario, compras, ventas, devoluciones, caja, consignaciones y taller con liquidación diaria y descuentos.
- Notificaciones rápidas de inventario y avisos operativos desde la barra superior.
- Copias de seguridad SQLite descargables para respaldo externo y recuento mensual consolidado en `.xlsx`.
- Datos separados de la instalación, instancia única y búsqueda de actualizaciones desde Inicio para el dueño.
- Verificación criptográfica de paquetes y respaldo local antes de migraciones pendientes.

Aún están pendientes impresión ESC/POS y restaurar copias externas directamente desde la interfaz.
