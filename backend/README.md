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
    catalog/       # productos, categorías, marcas y compatibilidad
    inventory/     # saldos y movimientos
    purchases/     # proveedores, compras y pagos
    sales/         # ventas, servicios, cobros y devoluciones
    employees/     # mecánicos y liquidación diaria
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

## Estado

Carpeta preparada. El código todavía no está implementado.
