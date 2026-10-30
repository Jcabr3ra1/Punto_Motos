# Tienda y taller de motocicletas

Propuesta de un sistema de gestión para una tienda de repuestos y taller de motocicletas, con inventario, compras, ventas, caja, servicios de taller, liquidación diaria de mecánicos y cierre de mes.

## Informe del proyecto

- [Leer el informe funcional y técnico](docs/informe_proyecto_taller.md).
- [Descargar la versión editable en Word](docs/informe_proyecto_taller.docx).

El informe contiene el alcance, las reglas del negocio, la arquitectura, el modelo de datos propuesto, la API, los respaldos, la impresión, el reparto del trabajo entre dos personas y las etapas de implementación.

## Arquitectura propuesta

- Aplicación de escritorio para Windows con Electron.
- Interfaz con React y TypeScript.
- Backend con Django y Django REST Framework.
- Base de datos local con SQLite para la modalidad inicial propuesta.
- Guardado automático y respaldos recuperables en ubicaciones configuradas.

Confirmado con el dueño: un solo computador con Windows y datos en su disco duro; impresora térmica de recibos de 80 mm; recibos sin facturación electrónica ni impuestos. Cada servicio se registra como una venta con tipo de servicio, placa y mecánico. La mano de obra se reparte por porcentaje entre mecánico y local (los repuestos son 100 % del local) y se paga al mecánico al final de cada día. Al cerrar el mes se guarda el resumen y los informes en Excel y PDF; el detalle de ventas se conserva un mes más y se elimina automáticamente al cerrar el mes siguiente. Si el dueño concluye que un servicio estuvo mal hecho, se le descuenta al mecánico en su siguiente pago la mano de obra devuelta y los repuestos que no pueden volver al inventario; los repuestos que vuelven en buen estado no se le descuentan, y si la causa es otra la asume el local. Siguen pendientes el modelo de impresora y el destino externo de los respaldos.

## Equipo

- **Juan:** parte visual (React), aplicación de escritorio (Electron), impresión del recibo de 80 mm, carga del inventario inicial, instalador, guía de uso y pruebas con el dueño.
- **Alex:** backend (Django, Django REST Framework y SQLite): modelos, API, reglas del negocio, liquidación diaria, cierre de mes, informes en Excel y PDF, respaldos y empaquetado Python.

## Estado

El repositorio contiene la documentación inicial para socializar y acordar el proyecto. La aplicación todavía no está implementada.

Fecha del informe: 29 de octubre de 2026.
