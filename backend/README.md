# Backend

Responsable: **Alex**.

API local en Django que concentra las reglas del negocio, los datos y la impresión de recibos. Tauri la ejecuta como *sidecar* y la interfaz de React la consume por HTTP. Ver la [sección 7 del informe](../docs/informe_proyecto_taller.md#7-arquitectura-de-escritorio-y-alternativas).

## Tecnologías

- Python con Django y Django REST Framework.
- SQLite como base de datos local.
- Waitress como servidor para la entrega (el servidor de desarrollo de Django no se usa en producción).
- PyInstaller para empaquetar el backend como ejecutable de Windows.
- python-escpos o la cola de impresión de Windows para imprimir en la térmica de 80 mm.

## Responsabilidades

- Modelos, migraciones, restricciones, índices y diccionario de datos.
- Contrato de la API en `/api/v1`, documentado con OpenAPI y acordado con Juan antes de cada pantalla.
- Reglas del negocio: inventario, compras, ventas, caja, servicios de taller, liquidación diaria de mecánicos, devoluciones y cierre de mes.
- Recibo y liquidación en ESC/POS, con corte de papel y apertura del cajón.
- Informes de cierre en Excel y PDF.
- Respaldos consistentes de SQLite, cifrado, envío a destinos externos, restauración y borrado automático del detalle del mes anterior.
- Arranque, comprobación de disponibilidad y cierre seguro del sidecar desde Tauri.
- Empaquetado con PyInstaller y nombre de sidecar `backend-x86_64-pc-windows-msvc.exe`.

## Reglas que no se negocian

- El backend es la autoridad de precios, permisos, cantidades y totales.
- El dinero se guarda en unidades monetarias menores enteras y se calcula con `Decimal`; nunca con punto flotante.
- Las cantidades son unidades enteras: no hay venta a granel.
- Las operaciones críticas usan transacciones cortas; imprimir, respaldar o esperar al usuario queda fuera de ellas.
- Un reintento de confirmación devuelve el resultado ya registrado y no duplica la venta.
- La API escucha solo en `127.0.0.1` y exige la credencial efímera generada en cada inicio.
- No se suben datos reales, contraseñas ni respaldos al repositorio.

## Estructura propuesta

```text
backend/
  config/          # settings, urls y wsgi
  apps/
    core/          # salud, datos del negocio, protección de la API y formato de errores
    accounts/      # usuarios, roles, sesión y permisos (IsOwner, IsOwnerOrReadOnly)
    catalog/       # tipos, marcas, motos, productos, códigos internos y buscador
    inventory/     # existencias, movimientos, ajustes e inventario inicial
    purchases/     # proveedores, compras y pagos
    sales/         # ventas, servicios, cobros y devoluciones
    workshop/      # tipos de servicio, mecánicos y liquidación diaria
    consignments/  # mercancía en consignación en otros locales
    cash/          # caja, gastos y retiros
    closings/      # cierre diario y de mes, informes
    printing/      # recibos ESC/POS
    backups/       # respaldos y restauración
  tests/
  requirements.txt
```

## Entregables

- Migraciones reproducibles y datos ficticios de prueba.
- Contrato OpenAPI con ejemplos en `docs/`.
- Pruebas de reglas, dinero, integridad y API.
- Ejecutable del sidecar listo para el instalador de Tauri.

## Cómo ejecutarlo

Requiere Python 3.12 o superior (probado con 3.14).

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # en Linux: .venv/bin/python
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py test
```

Para desarrollo, con los datos en `backend/.data/` y sin credencial:

```bash
.venv/Scripts/python manage.py createsuperuser   # crea el dueño
PUNTO_MOTO_DEBUG=1 .venv/Scripts/python manage.py runserver 127.0.0.1:8765
```

Toda la API exige sesión salvo `health`, `setup/*` y `auth/login`. Las vistas nuevas quedan cerradas por defecto: para abrir una hay que declarar `permission_classes` a propósito.

Como lo ejecutará Tauri (sidecar con Waitress): aplica migraciones y sirve la API. No arranca sin credencial y no crea una base vacía si la carpeta de datos no existe.

```bash
PUNTO_MOTO_DATA_DIR=/ruta/datos PUNTO_MOTO_TOKEN=<credencial> .venv/Scripts/python run.py --port 8765
```

| Variable | Uso |
| --- | --- |
| `PUNTO_MOTO_DATA_DIR` | Carpeta de datos con `punto_moto.sqlite3` y `secret_key`; por defecto `backend/.data/` |
| `PUNTO_MOTO_TOKEN` | Credencial efímera; obligatoria en `run.py` |
| `PUNTO_MOTO_ALLOWED_ORIGINS` | Orígenes permitidos separados por comas; por defecto la ventana de Tauri y Vite (`http://localhost:5173`) |
| `PUNTO_MOTO_DEBUG` | `1` para desarrollo |

## Contrato de la API

El contrato completo para el frontend, con ejemplos, errores y tipos TypeScript, está en [docs/backend/API.md](../docs/backend/API.md). Los cambios y lo que implican para el frontend se registran en [docs/backend/CAMBIOS.md](../docs/backend/CAMBIOS.md).

**Regla del equipo:** todo cambio en el backend actualiza esos dos documentos en el mismo commit. Ver [CLAUDE.md](../CLAUDE.md).

## Estado

Versión 0.11.0. Implementado: proyecto Django, SQLite en modo WAL, protección de la API local, datos del negocio, sidecar con Waitress; usuarios con roles dueño y vendedor, configuración inicial, sesión por token y administración de usuarios; y catálogo de tipos, marcas, motos y productos con código interno, sugerencia de códigos y buscador sin tildes; inventario con existencias que nunca quedan en negativo, movimientos con kárdex, ajustes con motivo y carga del inventario inicial; y compras a proveedores con borrador, recepción completa, costo promedio ponderado, alza automática del precio de venta cuando sube el costo e historial de precios, y pagos por abonos sin plazo repartidos entre las compras; ventas de mostrador pagadas completas, con clientes, pago en varios medios, protección contra doble envío y anulación; caja con apertura, gastos, retiros y cierre contra el efectivo contado; y consignación de mercancía a otros locales con entregas, reportes y pagos; y servicios de taller cobrados como líneas de la venta, con tipos de servicio, mecánicos con su porcentaje de la mano de obra y consumo interno de insumos de taller; y liquidación diaria de los mecánicos pagada desde la caja, sin pagar dos veces el mismo servicio; y devoluciones parciales de productos y servicios, con descuento al mecánico por mal servicio y saldo que pasa a la siguiente liquidación; y eliminación de productos sin historial, con bloqueo de productos duplicados. Comprobado con el sidecar real que los datos persisten y que las sesiones se cierran al reiniciar. Pendiente: cierres y reportes, respaldos, impresión ESC/POS y respaldos externos.

Convenciones del código:

- Dinero en pesos enteros (`PositiveBigIntegerField`), nunca decimales ni punto flotante.
- Nada se borra si ya pudo usarse en un documento: se desactiva con `is_active`.
- Los campos de búsqueda (`search_text`, `search_name`) se calculan en `save()`; `queryset.update()` y `bulk_update()` no los actualizan.
## Distribución Windows y protección de migraciones

`requirements-build.txt` añade PyInstaller a los requisitos existentes. `backend.spec` empaqueta código, dependencias y migraciones, sin datos locales. Desde `desktop/`, `npm.cmd run package:backend` genera el ejecutable para Tauri; `npm.cmd run build` construye el instalador completo. El usuario final no instala Python.

`run.py` crea un respaldo consistente antes de aplicar migraciones pendientes sobre una base existente. Incluye SQLite, `secret_key` y manifiesto con integridad y hashes en `data/backups/pre-migration/`. Un fallo impide migrar. Primera instalación sin base no requiere copia. Estos respaldos no tienen retención automática ni envío externo; ver [publicación y recuperación](../docs/PUBLICACION.md).
