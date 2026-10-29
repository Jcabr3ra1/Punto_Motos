# Sistema de gestión para tienda de repuestos y taller de motocicletas

Propuesta funcional y técnica para organizar el desarrollo entre dos personas

Fecha: 29 de octubre de 2026

## 1 Propósito y propuesta general

Proponemos desarrollar una aplicación de escritorio para Windows que permita administrar la tienda y el taller desde un computador. El dueño podrá registrar ventas, compras, gastos y reparaciones; consultar el inventario; asignar trabajos a empleados; imprimir documentos y recuperar la información desde respaldos.

El programa se abrirá desde un ícono e iniciará sus componentes automáticamente. La operación local funcionará sin internet. La conectividad será necesaria para enviar respaldos a una ubicación remota o utilizar futuras integraciones externas.

La arquitectura propuesta es Electron con React y TypeScript para la aplicación de escritorio, Django con Django REST Framework para la lógica del negocio y SQLite para los datos locales. El desarrollo puede hacerse en Linux; el empaquetado final y las pruebas de aceptación se harán en Windows.

Esta propuesta contempla un solo computador operativo. La cantidad de computadores sigue pendiente de confirmación. Si se requieren varios puestos escribiendo simultáneamente, revisaremos la arquitectura antes de implementar la persistencia y evaluaremos PostgreSQL centralizado. Los nombres comerciales, datos tributarios, impresora y reglas de remuneración también deben confirmarse.

## 2 Negocio e inventario observado

Las fotografías muestran una tienda de productos para motocicletas, con lubricantes, líquidos de mantenimiento, llantas, baterías, bujías, frenos, espejos, iluminación, filtros y kits de arrastre, entre otros artículos. El usuario solicita además administrar servicios de taller y el trabajo de los empleados.

Las familias iniciales del catálogo serían las siguientes.

| Familia | Datos que diferencian sus referencias |
| --- | --- |
| Aceites y lubricantes | Marca, línea, viscosidad, motor 2T o 4T y presentación |
| Líquidos y mantenimiento | Tipo, especificación, contenido y presentación |
| Llantas y neumáticos | Marca, medida, referencia y tipo |
| Frenos | Referencia, marca, tipo y compatibilidad con motos |
| Baterías y bujías | Referencia, especificaciones y compatibilidad |
| Iluminación y accesorios | Tipo, referencia, aplicación y presentación |
| Transmisión y filtros | Referencia, características y motos compatibles |

Las fotos son una referencia de clasificación. No permiten establecer cantidades exactas, costos, precios, proveedores ni todas las compatibilidades. El inventario inicial se cargará mediante conteo físico y revisión de referencias; no se sumarán productos repetidos entre fotografías.

## 3 Alcance de la primera versión

La primera versión deberá cubrir un ciclo completo de operación: registrar una compra, recibir existencias, vender un producto o usarlo en un trabajo, cobrar, imprimir y cerrar caja. También deberá respaldar y recuperar la información antes de utilizarse con datos reales.

| Módulo | Funciones incluidas |
| --- | --- |
| Inicio | Resumen del día, cobros, trabajos abiertos, saldos y alertas de inventario |
| Catálogo e inventario | Productos, categorías, marcas, referencias, compatibilidad, ubicación, existencias mínimas y movimientos |
| Compras y proveedores | Proveedores, compras, recepción, costos, pagos y saldos pendientes |
| Ventas | Productos y servicios, descuentos autorizados, cobros, abonos, devoluciones y anulaciones |
| Taller | Cliente, moto, orden, diagnóstico, trabajos, empleado asignado, repuestos y estados |
| Empleados | Datos, trabajos realizados, valores atribuidos y pagos registrados |
| Clientes y motos | Contacto, placa, marca, modelo, kilometraje opcional e historial |
| Caja y gastos | Apertura, entradas, salidas, gastos, retiros y cierre |
| Documentos | Comprobante de venta, orden de trabajo, PDF y reimpresión |
| Reportes | Ventas, cobros, costos, márgenes estimados, gastos, cartera e inventario |
| Configuración | Datos del negocio, usuarios, permisos, impresora y ubicaciones de almacenamiento |
| Respaldos | Copia manual y automática, historial, avisos y restauración controlada |

Los reportes financieros de esta versión serán de gestión operativa. No se presentarán como contabilidad formal, declaraciones tributarias ni certificación de utilidad contable. La facturación electrónica, la liquidación laboral y las integraciones bancarias requieren definición y desarrollo específicos.

Las mejoras posteriores podrán incluir lector de códigos, importación masiva más avanzada, recordatorios de mantenimiento, mensajería, acceso remoto y varios puestos. No se presume que estas funciones estén incluidas en la primera entrega.

## 4 Usuarios y experiencia de uso

El dueño tendrá acceso administrativo. Un vendedor podrá registrar ventas y cobros según sus permisos. El mecánico será un registro de empleado y podrá tener usuario propio si necesita operar el programa; ser empleado no obliga a tener acceso al sistema.

El administrador controlará quién consulta costos y reportes, modifica precios, concede descuentos, ajusta existencias, anula documentos o restaura información. Las acciones relevantes conservarán usuario, fecha y motivo. Los usuarios quedarán inactivos en lugar de eliminarse cuando tengan operaciones asociadas.

Al instalar, un asistente solicitará los datos básicos del negocio, el usuario administrador y las carpetas de trabajo. Después, el dueño abrirá el ícono, iniciará sesión y verá el resumen del día. Se podrá activar el inicio al iniciar sesión en Windows. El programa impedirá abrir dos instancias que compitan por los mismos datos.

Las pantallas priorizarán búsqueda rápida, botones claros, navegación con teclado y mensajes que expliquen qué se guardó o qué falta corregir. La interfaz distinguirá los borradores de las operaciones confirmadas.

## 5 Flujos principales y reglas del negocio

### 5 1 Compra y recepción de mercancía

Se selecciona el proveedor, se registra el documento y se agregan referencias, cantidades y costos. Una compra en borrador no altera el inventario. Confirmar la recepción registra los movimientos de entrada y actualiza el costo de las referencias recibidas. Un pago al proveedor es una operación separada, vinculada a la compra.

Para el inicio proponemos recepción completa de cada compra. Si el negocio necesita entregas parciales, lotes o vencimientos, se ampliará este flujo antes de desarrollarlo. Se propone costo promedio ponderado por referencia y conservación del costo aplicado en cada salida, sujeto a revisión con quien lleva las cuentas del negocio.

### 5 2 Venta de mostrador

Se buscan productos, se indican cantidades, se agregan servicios si corresponde y se calcula el total. Confirmar la venta registra el documento y las salidas de inventario en una misma transacción. El cobro podrá ser total, parcial o quedar pendiente si el usuario tiene permiso para vender a crédito.

Se registrará el medio de pago y se permitirá distribuir un cobro entre varios medios. Un doble clic o reintento no generará otra venta. Se bloquearán existencias negativas por defecto. Los precios y totales se validarán en Django, aunque también se muestren previamente en React.

### 5 3 Orden de trabajo

Se registra el cliente, la moto, el motivo de ingreso y el kilometraje cuando esté disponible. Se agregan tareas, presupuesto, empleado responsable y repuestos. Los estados propuestos son recibida, en diagnóstico, pendiente de autorización, en proceso, lista, entregada y cancelada. Se podrá omitir diagnóstico o autorización en servicios sencillos.

Los repuestos propuestos no descontarán existencias. Al marcar un repuesto como utilizado se registrará su salida vinculada a la orden. Al facturar o cobrar la orden no se descontará nuevamente. Si se devuelve un repuesto sin usar, se hará el movimiento inverso con su motivo. Una orden cancelada no devolverá automáticamente materiales ya consumidos.

La orden podrá contener varios trabajos y empleados. Una tarea tendrá inicialmente un responsable; la distribución entre varios mecánicos para una misma tarea se dejará para una ampliación si el dueño la necesita. El importe de mano de obra cobrado al cliente se registrará separado del importe reconocido al empleado.

Al cerrar la orden, sus conceptos se vincularán a una única venta. El costo de cada repuesto será el registrado en su movimiento de consumo original; una compra posterior no cambiará el margen de ese trabajo. Los anticipos se aplicarán al saldo y no se contarán otra vez como cobros. La entrega, el cierre del trabajo y el pago tendrán estados independientes para representar trabajos listos con saldo pendiente.

### 5 4 Trabajo y pago de empleados

Cada tarea conservará quién la realizó, cuándo terminó y cuánto se cobró de mano de obra. El sistema no supondrá que todo ese dinero pertenece al mecánico. La forma de remuneración sigue pendiente: sueldo, valor fijo por trabajo, porcentaje o combinación.

Hasta acordar esa regla, la propuesta contempla registrar manualmente el importe reconocido por tarea y los pagos al empleado, con permisos administrativos. Si luego se habilita un porcentaje, su base y valor se guardarán en cada operación para que una modificación futura no cambie el historial.

El cálculo de comisiones y sus ajustes por anulaciones o devoluciones se definirá antes de automatizarlo. La nómina, prestaciones y obligaciones laborales quedan fuera del cálculo inicial de trabajos.

### 5 5 Caja y cierre

Se abre la jornada con un saldo de efectivo. Cada cobro o pago se registra con fecha, usuario y medio. Los gastos y retiros del dueño se clasifican por separado. El cierre compara efectivo esperado con efectivo contado y conserva la diferencia y su explicación.

Una venta a crédito aumenta lo vendido y la cuenta por cobrar, pero no el efectivo. Un abono posterior aumenta lo cobrado y reduce el saldo, sin crear otra venta. Las transferencias se reportan por separado del dinero físico. Una compra pagada desde caja reduce el efectivo; una compra a crédito no lo reduce hasta que se paga.

### 5 6 Anulaciones y devoluciones

Los documentos confirmados conservarán su historial. La anulación exigirá permiso y motivo, y se representará mediante operaciones compensatorias, sin borrar el registro original. Las devoluciones parciales no podrán superar la cantidad vendida menos las devoluciones previas.

Se distinguirá el producto que vuelve en condiciones de venta del que está dañado. Un reembolso se registrará como salida de dinero; una devolución pendiente de reembolso conservará ese saldo. Las reglas fiscales del documento final se definirán cuando se determine el tipo de facturación.

## 6 Documentos e impresión

La venta ofrecerá guardar, guardar e imprimir y exportar a PDF. El historial permitirá consultar y reimprimir con el mismo número. La impresión se ejecutará después de confirmar los datos; si falla, la venta permanecerá registrada y aparecerá como pendiente de impresión.

El formato contendrá identificación y contacto del negocio, número, fecha, cliente cuando corresponda, placa opcional, productos, cantidades, valores, servicios, descuentos, impuestos configurados cuando apliquen, total, pagos y saldo. Las condiciones y textos adicionales se acordarán con el dueño.

También se imprimirá la orden de trabajo con cliente, moto, labores autorizadas y observaciones. La impresora y el papel están pendientes; se preparará una vista de impresión adaptable y se validará físicamente el tamaño elegido en Windows.

El primer alcance es la generación de documentos internos y PDF. No se asumirá que un comprobante impreso constituye una factura electrónica válida. El tipo de documento requerido deberá resolverse antes de poner la facturación en producción.

## 7 Arquitectura de escritorio y alternativas

La ruta de operación propuesta es la siguiente.

```text
Windows y aplicación Electron
             |
React -> API local Django -> SQLite
                              |
                 Respaldos a otros destinos
```

Electron gestionará la ventana, el ciclo de vida del backend, la selección de carpetas, la impresión y el acceso controlado al sistema operativo. React manejará las pantallas y consumirá la API; no accederá directamente a la base de datos ni ejecutará SQL.

Django aplicará permisos, validaciones, transacciones y reglas del negocio. Se ejecutará con un servidor local apropiado para la distribución, como Waitress, propuesto por su compatibilidad con Windows. El servidor de desarrollo de Django no se usará para la entrega.

El backend escuchará solamente en la interfaz local del computador. El empaquetado deberá resolver autenticación local, credencial efímera por inicio o mecanismo equivalente, restricciones de origen y protección de solicitudes. React tendrá aislamiento de contexto y no recibirá acceso general a Node ni a las credenciales administrativas del sistema. Las contraseñas usarán el mecanismo de hash de Django.

| Alternativa considerada | Ventaja | Costo o limitación | Uso propuesto |
| --- | --- | --- | --- |
| Escritorio local con SQLite | Arranque sencillo y operación sin internet | Un equipo operativo y respaldos propios | Base de esta propuesta |
| Escritorio con PostgreSQL local centralizado | Mejor encaje para varios puestos | Servicio adicional y administración | Si se confirma operación simultánea |
| React y Django alojados con PostgreSQL remoto | Acceso desde distintos lugares | Alojamiento recurrente e internet | Ampliación si el negocio la necesita |

La decisión aceptada en la conversación es avanzar con SQLite para la modalidad local. El uso de un solo equipo es una hipótesis pendiente de confirmar. Cambiar después a PostgreSQL requerirá migración y pruebas de datos y concurrencia; no se promete un cambio automático.

## 8 Almacenamiento y recuperación

### 8 1 Ubicación de los datos

La instalación y los datos estarán separados. La aplicación propondrá una carpeta de datos del usuario de Windows y permitirá elegir otra ubicación local con permisos adecuados. La base activa no se ubicará en una carpeta sincronizada, unidad de red ni memoria extraíble. Las copias generadas sí podrán enviarse a esos destinos cuando corresponda.

Cambiar la ubicación será una operación guiada: suspender escrituras, crear una copia consistente, trasladar datos y adjuntos, verificar la apertura y conservar la ubicación anterior hasta confirmar el cambio. Si falta la carpeta elegida, el programa mostrará un error claro y no creará silenciosamente una base vacía.

### 8 2 Política propuesta de respaldos

El respaldo incluirá una copia consistente de SQLite obtenida con su mecanismo de backup, los archivos adjuntos necesarios y un manifiesto con versión de esquema, aplicación, fecha e integridad. No bastará con copiar el archivo activo mientras se están registrando operaciones. Se verificará la integridad antes de informar éxito.

Se propone copia cada hora mientras el equipo esté encendido, además de una copia al cerrar cuando sea posible y una copia previa a actualizar o restaurar. Los intervalos y la retención serán configurables. Como punto de partida se propone conservar 24 copias horarias y 30 diarias, revisando el espacio real disponible.

Habrá al menos una copia fuera del disco principal. Puede ser un disco externo o un destino remoto configurado. El responsable deberá escoger y comprobar ese destino. Una carpeta en otra partición del mismo disco no protege frente a una falla física de ese disco.

Si no hay internet o el disco externo está desconectado, se conservará la copia local pendiente de envío y se mostrará la antigüedad del último respaldo externo correcto. El programa no ejecutará tareas con el computador apagado. Las copias externas sensibles se cifrarán y se definirá cómo custodiar la clave de recuperación.

### 8 3 Restauración y continuidad

Restaurar requerirá permiso administrativo, validar el archivo, comprobar compatibilidad, detener operaciones y respaldar primero el estado actual. Se restaurará a una ubicación temporal y se verificará antes de reemplazar los datos. La prueba de aceptación incluirá recuperación en otro computador Windows con una instalación limpia.

Con respaldos horarios podría faltar hasta aproximadamente una hora de operaciones si todas las copias se realizaron correctamente. Si hubo fallos o el respaldo externo estaba desconectado, la pérdida posible será mayor. No se prometerá pérdida cero. La restauración de un respaldo no envía automáticamente sus cambios a otras instalaciones.

## 9 Modelo de datos propuesto

El amigo responsable del backend administrará el esquema mediante modelos y migraciones de Django. El SQL directo se reservará para consultas justificadas y parametrizadas. Se evitarán cambios manuales de tablas que no estén reflejados en las migraciones.

| Grupo | Entidades principales | Relación o propósito |
| --- | --- | --- |
| Configuración | BusinessSettings, User, Role, AuditEvent | Negocio, permisos y trazabilidad |
| Catálogo | Category, Brand, Product, ProductCompatibility | Identificación de referencias y aplicaciones |
| Inventario | InventoryBalance, InventoryMovement | Saldo y entradas o salidas justificadas |
| Compras | Supplier, Purchase, PurchaseItem, SupplierPayment | Compras, recepción y pagos |
| Clientes | Customer, Motorcycle | Propietario o contacto e historial por moto |
| Ventas | Sale, SaleItem, CustomerPayment, PaymentAllocation | Documento, conceptos y aplicación de cobros |
| Taller | WorkOrder, WorkTask, WorkMaterial, AdvanceAllocation | Tareas, responsables, consumos y anticipos |
| Empleados | Employee, WorkCompensation, EmployeePayment | Importes reconocidos y pagos |
| Caja | CashSession, CashMovement, Expense, OwnerWithdrawal | Operación de caja, gastos y retiros |
| Correcciones | Return, ReturnItem, Reversal | Devoluciones y compensaciones vinculadas |
| Documentos | DocumentSequence, PrintEvent, Attachment | Numeración, reimpresión y adjuntos |
| Recuperación | BackupRun, BackupDestination | Historial y estado de respaldos |

Cada movimiento de inventario conservará producto, cantidad con signo, tipo, documento de origen, costo aplicado, usuario, fecha y motivo cuando corresponda. Se podrá reconstruir y conciliar el saldo desde los movimientos. Los ajustes físicos exigirán causa; no se modificará una cantidad sin dejar trazabilidad.

CustomerPayment podrá registrar un anticipo vinculado inicialmente a WorkOrder. Al generar la venta, PaymentAllocation o AdvanceAllocation aplicará ese mismo pago al documento, sin crear un segundo cobro ni movimiento de caja. Las asignaciones impedirán aplicar más dinero del disponible o superar el saldo pendiente.

SaleItem conservará descripción, precio, descuento, impuesto si aplica y costo al momento de la operación. Cambiar el catálogo no alterará documentos anteriores. WorkTask se vinculará al empleado responsable y a la orden; WorkMaterial registrará si el repuesto está propuesto, consumido o devuelto y su movimiento asociado.

Los importes confirmados se almacenarán en unidades monetarias menores enteras y se calcularán con Decimal en el backend, con reglas explícitas de redondeo. No se usarán números de punto flotante binario para sumar dinero. Las cantidades iniciales serán unidades enteras; la venta de aceite u otros productos a granel requerirá definir unidades y precisión antes de habilitarla.

Se usarán identificadores internos independientes del número visible de documento. Habrá restricciones para referencias únicas, números de documentos y claves de reintento. Los campos obligatorios, índices y relaciones se documentarán en un diccionario de datos del backend. Fechas técnicas se almacenarán consistentemente y se presentarán según la zona horaria configurada del negocio, inicialmente America/Bogota como propuesta.

## 10 API y coordinación entre frontend y backend

La API tendrá el prefijo /api/v1 y un contrato OpenAPI versionado. Ambos desarrolladores acordarán campos, estados, errores y ejemplos antes de construir cada pantalla. El frontend podrá trabajar con respuestas simuladas ajustadas a ese contrato mientras se implementa Django.

| Área | Endpoints orientativos | Responsable del backend |
| --- | --- | --- |
| Sesión | POST /auth/login, POST /auth/logout, GET /auth/me | Autenticación y permisos |
| Catálogo | GET y POST /products, PATCH /products/{id} | Filtros, referencias y validación |
| Inventario | GET /inventory/movements, POST /inventory/adjustments | Trazabilidad y ajustes |
| Compras | POST /purchases, POST /purchases/{id}/receive | Recepción transaccional |
| Ventas | POST /sales, POST /sales/{id}/confirm | Totales, existencias e idempotencia |
| Cobros | POST /payments, GET /receivables | Aplicación a documentos y saldos |
| Taller | POST /work-orders, POST /work-orders/{id}/consume | Estados, tareas y materiales |
| Caja | POST /cash-sessions/open, POST /cash-sessions/{id}/close | Movimientos y conciliación |
| Correcciones | POST /returns, POST /sales/{id}/void | Validación y compensaciones |
| Reportes | GET /reports/sales, GET /reports/inventory | Cálculos y filtros |
| Documentos | GET /sales/{id}/document | Datos inmutables para impresión |
| Respaldos | GET /backups, POST /backups, POST /restore/validate | Estado y operaciones restringidas |

Las rutas son una propuesta de contrato, no endpoints implementados. La selección de carpetas y los diálogos de Windows serán responsabilidad de Electron; el acceso al sistema de archivos se expondrá de forma limitada. La restauración efectiva se coordinará con el proceso principal para cerrar conexiones y reiniciar el backend con seguridad.

Los listados tendrán paginación, búsqueda y ordenación. Los errores devolverán código estable, mensaje comprensible y errores por campo cuando apliquen. Se distinguirán errores de validación, permisos y conflictos de operación. Un reintento de confirmación conservará el mismo identificador y devolverá el resultado ya registrado.

El backend será la autoridad de precios, permisos, cantidades y totales. La interfaz enviará identificadores y cantidades y mostrará el cálculo confirmado por Django. Las operaciones críticas se ejecutarán en transacciones cortas; imprimir, enviar respaldos o esperar interacción humana quedará fuera de ellas.

## 11 Distribución del trabajo entre dos personas

La distribución propuesta toma como base que el amigo quiere trabajar en SQL y Django. Los nombres se podrán sustituir cuando acuerden el reparto definitivo.

| Frente | Tu responsabilidad propuesta | Responsabilidad de tu amigo |
| --- | --- | --- |
| Requisitos | Recoger flujos del dueño y validar pantallas | Revisar reglas y consistencia de datos |
| Interfaz | React, navegación, formularios, tablas y estados | Contratos y ejemplos de respuestas |
| Datos | Consumir la API y mostrar errores | Modelos, migraciones, restricciones e índices |
| Negocio | Representar flujos y evitar dobles acciones | Transacciones, inventario, caja y cálculos |
| Escritorio | Electron, ventanas, carpetas e impresión | Arranque y cierre seguro de Django |
| Respaldos | Configuración visual y avisos | Copia consistente, validación y restauración |
| Pruebas | Flujos completos y experiencia en Windows | Pruebas de reglas, integridad y API |
| Entrega | Instalador y guía del usuario | Migraciones, empaquetado Python y diagnóstico |

Se propone un único repositorio con carpetas frontend, backend, desktop y docs. La especificación de la API y los ejemplos vivirán en docs. Cada cambio se hará en una rama corta y se revisará por el otro integrante antes de integrarlo. No se subirán datos reales de clientes, contraseñas ni respaldos al repositorio.

El backend entregará migraciones reproducibles, datos ficticios de prueba, contrato API y pruebas de operaciones críticas. El frontend entregará pantallas integradas, estados de carga y error, impresión y pruebas de interacción. Ambos serán responsables de que el instalador funcione en un Windows limpio.

En cada sesión de coordinación se revisarán tres puntos: qué flujo completo ya funciona, qué contrato cambió y qué bloqueo necesita al otro integrante. Se evitará desarrollar durante semanas con contratos diferentes. Los cambios de campos o estados deben actualizar contrato, datos de ejemplo y pruebas relacionadas.

## 12 Desarrollo en Linux y entrega en Windows

El desarrollo diario se realizará en Linux con entornos separados de Python y Node. Se fijarán versiones compatibles al iniciar el proyecto y se conservarán archivos de dependencias reproducibles. Ambos integrantes trabajarán con la misma estructura y datos ficticios.

Una primera prueba temprana empaquetará una pantalla sencilla y un backend que lea y escriba un dato local. Su objetivo será verificar desde el comienzo el arranque de Electron, el proceso Python, las carpetas de Windows y la persistencia después de reiniciar. Así se evaluará la parte más sensible antes de construir todos los módulos.

El paquete Python podrá generarse con PyInstaller en Windows. Después, Electron Forge u otra herramienta acordada generará el instalador. Podemos utilizar un computador Windows, una máquina virtual o un ejecutor de integración continua Windows. El acceso a ese entorno sigue pendiente de resolver.

El instalador incluirá las dependencias necesarias para el usuario final. La actualización hará respaldo previo, ejecutará migraciones controladas y comprobará que el backend arranque. Si una migración falla, se bloqueará el uso y se ofrecerá una recuperación guiada; no se abrirá una base incompleta. Se decidirán formato de instalador, arquitectura de Windows y mecanismo de actualización en la fase de empaquetado.

## 13 Etapas y entregables verificables

Las etapas indican dependencias y resultados, no fechas comprometidas. La duración se estimará después de confirmar disponibilidad de ambos integrantes, alcance de impresión y acceso a Windows.

| Etapa | Resultado esperado | Criterio para avanzar |
| --- | --- | --- |
| 0 Definición | Reglas pendientes, alcance y contrato inicial | Ambos pueden explicar el mismo flujo de compra y venta |
| 1 Prueba de escritorio | Electron, Django y SQLite instalables | Un dato persiste después de cerrar y reiniciar en Windows |
| 2 Catálogo y compras | Productos, proveedores, recepción e inventario inicial | Una recepción aumenta exactamente las existencias correctas |
| 3 Ventas y caja | Venta, cobro, abono, gastos y cierre | Inventario, saldos y caja concilian sin duplicados |
| 4 Taller y empleados | Orden, tarea, consumo, cobro y atribución | El repuesto se descuenta una sola vez y queda el responsable |
| 5 Documentos y reportes | Impresión, PDF, consultas y reportes | Una reimpresión conserva documento y resultados |
| 6 Recuperación y entrega | Respaldos externos, restauración y manual | Se recuperan datos y adjuntos en otro Windows |

Los respaldos básicos se incorporarán desde la primera persistencia y se ampliarán durante el desarrollo. La etapa final valida el ciclo completo; no se esperará hasta ella para empezar a proteger datos.

## 14 Pruebas y aceptación

Las pruebas se centrarán en errores que puedan cambiar dinero, existencias o historial. La aceptación del dueño utilizará ejemplos de su operación, primero con datos de prueba y luego con un conteo inicial aprobado.

| Escenario | Resultado que debe comprobarse |
| --- | --- |
| Compra de 10 unidades | Aumenta 10 y queda registrado proveedor y costo |
| Venta de 2 unidades | Descuenta 2 y conserva precio y costo de la operación |
| Doble clic o reintento | Existe una sola venta y un solo descuento |
| Venta sin existencias | Se bloquea y no deja movimientos parciales |
| Venta a crédito y abono | El abono reduce saldo sin duplicar ingresos por venta |
| Orden con repuesto consumido | Cobrar la orden no vuelve a descontarlo |
| Devolución parcial | Respeta cantidades máximas, estado y reembolso |
| Usuario sin permiso | No ajusta inventario ni restaura respaldos |
| Impresora desconectada | La venta queda guardada y permite reimprimir |
| Destino de respaldo ausente | Se muestra fallo y última copia externa válida |
| Cierre inesperado o reinicio | Las operaciones confirmadas conservan integridad |
| Actualización de versión | Mantiene datos, adjuntos e historial |
| Restauración en otro equipo | Recupera registros, saldos y documentos esperados |
| Jornada simulada e historial amplio | Responde de forma aceptable en el equipo objetivo |

La prueba de carga se definirá con el volumen diario y el tamaño esperado del catálogo. La cantidad de horas encendido no es por sí sola un límite de SQLite; las consultas, el disco y las escrituras simultáneas sí influyen. No se afirmará un rendimiento concreto sin medirlo en el equipo objetivo.

## 15 Costos y decisiones pendientes

La modalidad local evita pagar un servidor para mantener la aplicación operativa. React, Django, Electron y SQLite no requieren comprar una licencia de uso para este planteamiento, sujeto a conservar los avisos y condiciones de sus dependencias. Seguirán existiendo costos de desarrollo, soporte, equipo, energía, impresora, consumibles y el destino de respaldo elegido.

No se compromete un servicio de nube ni una tarifa anual en esta propuesta. El almacenamiento remoto de copias se cotizará cuando el dueño elija proveedor, capacidad y retención. La firma del instalador, si se contrata, será otro concepto. El acceso remoto y la facturación electrónica, si se solicitan, se presupuestarán por separado.

Para la reunión de socialización proponemos resolver lo siguiente.

| Decisión | Motivo | Propuesta inicial |
| --- | --- | --- |
| Uno o varios computadores | Determina la base y el despliegue | Un solo equipo para la primera versión |
| Entorno Windows de pruebas | Necesario para instalar y validar | Equipo o máquina virtual disponible desde el inicio |
| Remuneración de mecánicos | Determina cálculos y liquidaciones | Registro por tarea sin porcentaje supuesto |
| Tipo de documento de venta | Determina alcance fiscal e integración | Aclararlo con el dueño antes de producción |
| Impresora y papel | Define formato y prueba física | Pendiente de referencia del equipo |
| Carpeta y destino externo | Determina recuperación y costos | Datos locales y respaldo fuera del disco principal |
| Productos a granel y unidades | Cambia precisión y movimientos | Unidades enteras hasta confirmar necesidad |
| Impuestos y saldos iniciales | Afecta totales y reportes | Parámetros y carga revisados por el responsable |
| Horas disponibles de cada integrante | Permite estimar calendario | Estimar por entregables después de esta reunión |

La reunión puede seguir este orden: revisar el objetivo y el flujo completo; confirmar la arquitectura local; acordar responsabilidades; resolver las decisiones pendientes; seleccionar el primer entregable y fijar la próxima revisión. La primera implementación propuesta es un instalador mínimo con persistencia y respaldo verificables, seguido del ciclo de catálogo, compra y venta.

## 16 Fuentes técnicas de referencia

Las fuentes respaldan las decisiones de arquitectura y deben revisarse al fijar las versiones del proyecto. No sustituyen las pruebas de integración ni la confirmación de los requisitos del negocio.

1. Electron. Introducción a aplicaciones de escritorio. https://www.electronjs.org/docs/latest/
2. Django. Bases de datos compatibles y límites de SQLite. https://docs.djangoproject.com/en/5.2/ref/databases/
3. SQLite. Usos adecuados y comparación con bases cliente servidor. https://sqlite.org/whentouse.html
4. SQLite. Transacciones. https://sqlite.org/transactional.html
5. SQLite. API de respaldo en línea. https://www.sqlite.org/backup.html
6. Django REST Framework. Autenticación y permisos. https://www.django-rest-framework.org/api-guide/authentication/
7. Electron. Recomendaciones de seguridad. https://www.electronjs.org/docs/latest/tutorial/security
8. PyInstaller. Empaquetado por sistema operativo. https://pyinstaller.org/en/stable/
9. Electron Forge. Ciclo de construcción y empaquetado. https://www.electronforge.io/core-concepts/build-lifecycle
10. Waitress. Servidor WSGI para Python. https://docs.pylonsproject.org/projects/waitress/en/stable/

Consulta de documentación y preparación del informe: 29 de octubre de 2026.
