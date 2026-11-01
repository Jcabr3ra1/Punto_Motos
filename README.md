# Tienda y taller de motocicletas

Propuesta de un sistema de gestión para una tienda de repuestos y taller de motocicletas, con inventario, compras, ventas, caja, servicios de taller, liquidación diaria de mecánicos y cierre de mes.

## Informe del proyecto

- [Leer el informe funcional y técnico](docs/informe_proyecto_taller.md).
- [Descargar la versión editable en Word](docs/informe_proyecto_taller.docx).

El informe contiene el alcance, las reglas del negocio, la arquitectura, el modelo de datos propuesto, la API, los respaldos, la impresión, el reparto del trabajo entre dos personas y las etapas de implementación.

## Arquitectura propuesta

- Aplicación de escritorio para Windows con Tauri 2 (WebView2), con Django como sidecar.
- Impresión directa de recibos ESC/POS desde Django a la impresora térmica.
- Interfaz con React y TypeScript.
- Backend con Django y Django REST Framework.
- Base de datos local con SQLite para la modalidad inicial propuesta.
- Guardado automático y respaldos recuperables en ubicaciones configuradas.

Confirmado con el dueño: un solo computador con Windows y datos en su disco duro; impresora térmica de recibos de 80 mm; recibos sin facturación electrónica ni impuestos. Toda venta lleva el nombre del cliente. Cada servicio se registra como una línea de venta con tipo de servicio y mecánico obligatorios y placa opcional; la venta de productos no lleva mecánico. Solo el dueño puede cambiar precios. Sin escáner: cada producto tiene un código interno corto, sugerido o generado por el sistema. La mano de obra se reparte por porcentaje entre mecánico y local (los repuestos son 100 % del local) y se paga al mecánico al final de cada día. Al cerrar el mes se guarda el resumen y los informes en Excel y PDF; el detalle de ventas se conserva un mes más y se elimina automáticamente al cerrar el mes siguiente. Si el dueño concluye que un servicio estuvo mal hecho, se le descuenta al mecánico en su siguiente pago la mano de obra devuelta y los repuestos que no pueden volver al inventario; los repuestos que vuelven en buen estado no se le descuentan, y si la causa es otra la asume el local. Siguen pendientes el modelo de impresora y el destino externo de los respaldos.

## Equipo

- **Juan:** parte visual (React), aplicación de escritorio (Tauri), diseño del recibo de 80 mm y prueba en la impresora, carga del inventario inicial, instalador, guía de uso y pruebas con el dueño.
- **Alex:** backend (Django, Django REST Framework y SQLite): modelos, API, reglas del negocio, liquidación diaria, cierre de mes, informes en Excel y PDF, envío ESC/POS a la impresora, respaldos y empaquetado Python como sidecar de Tauri.

## Carpetas de trabajo

| Carpeta | Responsable | Contenido |
| --- | --- | --- |
| [frontend/](frontend/README.md) | Juan | Interfaz en React y TypeScript |
| [desktop/](desktop/README.md) | Juan, con Alex en el sidecar | Aplicación Tauri 2 e instalador para Windows |
| [backend/](backend/README.md) | Alex | API Django, SQLite, impresión ESC/POS, informes y respaldos |
| [docs/](docs/) | Ambos | Informe del proyecto y contrato de la API |

## Estado

El repositorio contiene la documentación inicial para socializar y acordar el proyecto. La aplicación todavía no está implementada.

Fecha del informe: 29 de octubre de 2026.
