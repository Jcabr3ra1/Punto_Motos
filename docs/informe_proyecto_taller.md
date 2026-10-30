# Sistema de gestión para tienda de repuestos y taller de motocicletas

Propuesta funcional y técnica para organizar el desarrollo entre dos personas

Fecha: 29 de octubre de 2026. Actualizado el 30 de octubre de 2026: la aplicación de escritorio pasa de Electron a Tauri.

## 1 Propósito y propuesta general

Proponemos desarrollar una aplicación de escritorio para Windows que permita administrar la tienda y el taller desde un computador. El dueño podrá registrar ventas, compras, gastos y reparaciones; consultar el inventario; asignar trabajos a empleados; imprimir documentos y recuperar la información desde respaldos.

El programa se abrirá desde un ícono e iniciará sus componentes automáticamente. La operación local funcionará sin internet. La conectividad será necesaria para enviar respaldos a una ubicación remota o utilizar futuras integraciones externas.

La arquitectura propuesta es Tauri 2 con React y TypeScript para la aplicación de escritorio, Django con Django REST Framework para la lógica del negocio y SQLite para los datos locales. El desarrollo puede hacerse en Linux; el empaquetado final y las pruebas de aceptación se harán en Windows.

El dueño confirmó que el sistema funcionará en un solo computador con Windows. Si en el futuro se requieren varios puestos escribiendo simultáneamente, se revisará la arquitectura y se evaluará PostgreSQL centralizado. Los nombres comerciales y datos del negocio que aparecerán en el recibo siguen pendientes de confirmar.

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

Confirmado con el dueño: al iniciar el programa se hará un inventario global de todo lo que tiene el negocio. Ese conteo constituye los saldos iniciales y se registrará como un movimiento de inventario inicial por referencia, con su costo y precio de venta. No habrá otra carga de saldos aparte de ese conteo.

Los aceites y demás productos se venden solamente en la presentación cerrada de fábrica, por unidades enteras. No habrá venta a granel ni fracciones.

## 3 Alcance de la primera versión

La primera versión deberá cubrir un ciclo completo de operación: registrar una compra, recibir existencias, vender productos y servicios de taller, cobrar, imprimir el recibo, cerrar caja, liquidar a los mecánicos y cerrar el mes. También deberá respaldar y recuperar la información antes de utilizarse con datos reales.

| Módulo | Funciones incluidas |
| --- | --- |
| Inicio | Resumen del día, cobros, servicios realizados, saldos y alertas de inventario |
| Catálogo e inventario | Productos, categorías, marcas, referencias, compatibilidad, ubicación, existencias mínimas y movimientos |
| Compras y proveedores | Proveedores, compras, recepción, costos, pagos y saldos pendientes |
| Ventas | Productos y servicios, descuentos autorizados, cobros, abonos, devoluciones y anulaciones |
| Taller | Servicios registrados como venta: tipo de servicio, placa, mecánico, valor acordado y repuestos usados |
| Empleados | Datos, porcentaje de mano de obra, liquidación y pago diario |
| Clientes | Nombre y contacto opcionales; la placa se registra en cada servicio |
| Caja y gastos | Apertura, entradas, salidas, gastos, retiros y cierre |
| Documentos | Recibo de 80 mm, liquidación diaria, PDF y reimpresión del mes actual y el anterior |
| Reportes y cierres | Cierre diario, cierre de mes, ventas, costos, ganancia estimada, pagos a mecánicos e inventario, exportables a Excel y PDF |
| Configuración | Datos del negocio, usuarios, permisos, impresora y ubicaciones de almacenamiento |
| Respaldos | Copia manual y automática, historial, avisos y restauración controlada |

Los reportes financieros de esta versión serán de gestión operativa. No se presentarán como contabilidad formal, declaraciones tributarias ni certificación de utilidad contable. Confirmado con el dueño: el sistema emitirá recibos de compra sin facturación electrónica y no calculará ni mostrará impuestos. La liquidación laboral formal y las integraciones bancarias quedan fuera del alcance.

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

### 5 3 Servicio de taller

El servicio se negocia con el cliente, se realiza y al final se registra como una venta con el valor acordado. No habrá orden de trabajo previa, presupuesto, diagnóstico ni estados intermedios. Solo se guarda el valor final que el cliente va a pagar.

Cada servicio será una línea de la venta con cuatro datos obligatorios:

- Tipo de servicio, elegido de una lista configurable (por ejemplo cambio de aceite, frenos, mantenimiento general, sistema eléctrico o transmisión), con una opción "otro" y una descripción corta.
- Placa de la moto.
- Mecánico que realizó el servicio.
- Valor de mano de obra acordado.

Los repuestos que se usaron se agregan a la misma venta como líneas de producto. Descuentan inventario al confirmar la venta y su valor es 100 % del local. Una venta puede tener varios servicios, cada uno con su mecánico. Al confirmarla se cobra y se imprime el recibo de 80 mm.

Los insumos de taller que se usan en pequeñas cantidades, como líquido de frenos, aceite hidráulico, grasa, limpiadores u otros productos que el local aporta en poca cantidad, no se cobran por separado: su valor va incluido en la mano de obra. Esos productos se marcarán en el catálogo como insumo de taller. Cuando se abra un envase para uso del taller se registrará una salida por consumo interno, sin cobrarla al cliente. Así el inventario sigue cuadrando sin tener que medir pequeñas cantidades.

### 5 4 Liquidación diaria de mecánicos

Regla confirmada con el dueño: la mano de obra de cada servicio se reparte en un porcentaje para el mecánico y otro para el local, por ejemplo 60 % mecánico y 40 % local. Los repuestos son 100 % del local y no entran en el reparto. El porcentaje se configurará por empleado, con un valor general por defecto, y solo el administrador podrá cambiarlo.

Al finalizar el día, el sistema suma la mano de obra de los servicios confirmados de cada mecánico, aplica su porcentaje y muestra el valor que le corresponde. Ese valor se le paga el mismo día y se registra como salida de caja. De la liquidación solo se guarda cuánto le correspondió al mecánico ese día: mecánico, fecha, total de mano de obra, porcentaje aplicado y valor pagado.

Como el valor del servicio se acuerda antes de registrarlo, no hay descuentos aparte sobre la mano de obra. Un servicio anulado antes de la liquidación del día no se cuenta.

Confirmado con el dueño: cuando el dueño de la moto pide la devolución de su dinero por un servicio, el dueño del negocio revisa el caso y decide la causa. La devolución se registra como salida de caja y el sistema exige elegir una de estas causas:

- **Mal servicio del mecánico:** el dueño del negocio concluye que hubo una mala instalación o una mala realización del servicio. Se le devuelve al cliente la mano de obra y los repuestos, y el monto total devuelto se le descuenta al mecánico en su siguiente pago.
- **Otra causa:** por ejemplo un repuesto defectuoso de fábrica o una decisión comercial del negocio. El local asume la devolución y no se le descuenta nada al mecánico.

Solo el administrador puede registrar una devolución con causa de mal servicio. El descuento queda anotado en la liquidación del día con el servicio, la placa, el monto y el motivo escrito. Si el descuento es mayor que lo que le corresponde al mecánico ese día, el saldo pendiente pasa a la liquidación siguiente. La devolución se puede hacer mientras el detalle del servicio siga disponible, es decir, hasta el cierre del mes siguiente.

En una devolución por mal servicio, cada repuesto devuelto se marca según su estado:

- **Vuelve al negocio en buen estado:** reingresa al inventario para venderse otra vez y no se le descuenta al mecánico.
- **No puede volver** (dañado, instalado o inservible): se registra como pérdida de inventario y su valor sí se le descuenta al mecánico.

La mano de obra devuelta siempre se le descuenta al mecánico cuando la causa es mal servicio.

La nómina, prestaciones y obligaciones laborales quedan fuera del cálculo.

### 5 5 Caja y cierre

Se abre la jornada con un saldo de efectivo. Cada cobro o pago se registra con fecha, usuario y medio. Los gastos y retiros del dueño se clasifican por separado. El cierre compara efectivo esperado con efectivo contado y conserva la diferencia y su explicación.

Una venta a crédito aumenta lo vendido y la cuenta por cobrar, pero no el efectivo. Un abono posterior aumenta lo cobrado y reduce el saldo, sin crear otra venta. Las transferencias se reportan por separado del dinero físico. Una compra pagada desde caja reduce el efectivo; una compra a crédito no lo reduce hasta que se paga.

### 5 6 Anulaciones y devoluciones

Los documentos confirmados conservarán su historial. La anulación exigirá permiso y motivo, y se representará mediante operaciones compensatorias, sin borrar el registro original. Las devoluciones parciales no podrán superar la cantidad vendida menos las devoluciones previas.

Se distinguirá el producto que vuelve en condiciones de venta del que está dañado. Un reembolso se registrará como salida de dinero; una devolución pendiente de reembolso conservará ese saldo. Las reglas fiscales del documento final se definirán cuando se determine el tipo de facturación.

### 5 7 Cierre de mes

Al terminar el mes, el administrador ejecutará el cierre de mes. Antes de permitirlo, el sistema comprobará que todos los días tengan cierre de caja y liquidación de mecánicos.

El cierre guardará solamente el resumen del mes:

- Total vendido en productos y total de mano de obra.
- Costo de los productos vendidos y consumidos.
- Gastos del mes.
- Total pagado a cada mecánico y la parte del local en la mano de obra.
- Ganancia estimada: ventas menos costo de productos, gastos y pagos a mecánicos.
- Inventario valorizado al cierre.

Con el cierre se generan los informes en Excel y PDF. Un mes cerrado no se puede modificar. El saldo de inventario y el costo de cada referencia al cierre pasan a ser el saldo inicial del mes siguiente.

Confirmado con el dueño: el detalle de un mes cerrado (ventas diarias, recibos y liquidaciones diarias) se conserva durante un mes más, en el disco del computador. Mientras tanto se puede consultar y reimprimir, y sirve para atender reclamos y devoluciones, pero ya no se puede modificar. Cuando se cierra el mes siguiente, el sistema elimina automáticamente el detalle del mes anterior y conserva para siempre solo su resumen final y sus informes en Excel y PDF.

Por ejemplo, al cerrar febrero se elimina el detalle de enero; el detalle de febrero queda disponible hasta el cierre de marzo.

Antes de eliminar, el sistema hará un respaldo y verificará que el resumen y los informes del mes se generaron correctamente. Si algo falla, no elimina nada y muestra el error. Las copias de respaldo que todavía contengan ese detalle se irán reemplazando según la retención configurada en la sección 8 2.

## 6 Documentos e impresión

La venta ofrecerá guardar, guardar e imprimir y exportar a PDF. El historial permitirá consultar y reimprimir con el mismo número durante el mes actual y el mes anterior. La impresión se ejecutará después de confirmar los datos; si falla, la venta permanecerá registrada y aparecerá como pendiente de impresión.

El recibo contendrá identificación y contacto del negocio, número, fecha, cliente cuando corresponda, tipo de servicio, placa y mecánico en los servicios de taller, productos, cantidades, valores, mano de obra, descuentos, total, pagos y saldo. No incluirá impuestos. Las condiciones y textos adicionales se acordarán con el dueño.

También se imprimirá la liquidación diaria de cada mecánico. Los informes de cierre de mes se generarán en Excel y PDF.

Confirmado con el dueño: se usará una impresora térmica de recibos. Se diseñará un formato de rollo angosto, de una columna, con texto grande para totales y sin colores. Confirmado: el papel será de 80 mm. El modelo de la impresora aún no se ha escogido; servirá cualquier térmica de 80 mm con controlador para Windows. Tauri no ofrece impresión silenciosa integrada: la impresión desde la ventana abre el diálogo de Windows. Por eso la primera versión imprimirá desde el backend: Django generará el recibo y la liquidación en comandos ESC/POS y los enviará en crudo a la impresora configurada mediante la cola de impresión de Windows, sin abrir diálogos. Así se incluyen también el corte de papel y la apertura del cajón de dinero. Si el modelo elegido no admite ESC/POS, se usará como alternativa un plugin de impresión de Tauri o la impresión del PDF mediante el controlador de Windows. El tamaño y el corte se validarán físicamente con la impresora real.

Los documentos serán recibos internos de compra, sin facturación electrónica, y también podrán exportarse a PDF.

## 7 Arquitectura de escritorio y alternativas

La ruta de operación propuesta es la siguiente.

```text
Windows y aplicación Tauri (WebView2)
             |
React -> API local Django (sidecar) -> SQLite
                  |                      |
      Impresora térmica ESC/POS   Respaldos a otros destinos
```

Tauri gestionará la ventana, el ciclo de vida del backend, la selección de carpetas, la instancia única, el inicio con Windows y el acceso controlado al sistema operativo. Su proceso principal está escrito en Rust y la interfaz se muestra con WebView2, el motor web de Microsoft Edge que ya viene en Windows 11; el instalador incluirá el instalador de WebView2 para equipos que no lo tengan. El backend Django, empaquetado con PyInstaller, se distribuirá como sidecar de Tauri: un ejecutable externo que Tauri inicia al abrir la aplicación, cuya disponibilidad comprueba antes de mostrar las pantallas y que cierra al salir. React manejará las pantallas y consumirá la API; no accederá directamente a la base de datos ni ejecutará SQL.

Se eligió Tauri en lugar de Electron por estas razones:

| Criterio | Tauri | Electron |
| --- | --- | --- |
| Motor web | WebView2 del sistema | Chromium incluido en cada instalación |
| Tamaño del instalador | Pocos megabytes más el backend Python | Del orden de 80 a 150 MB más el backend Python |
| Consumo de memoria | Menor | Mayor |
| Seguridad | Permisos explícitos por capacidad y acceso al sistema denegado por defecto | Requiere configurar aislamiento de contexto y preload con cuidado |
| Backend externo | Sidecar oficial declarado en la configuración | Proceso hijo gestionado desde Node.js |
| Impresión silenciosa | No integrada; se resuelve en Django con ESC/POS | Integrada en el motor |
| Lenguaje del proceso principal | Rust | JavaScript o TypeScript |

El costo de esta decisión es que el equipo deberá aprender lo básico de Rust para el proceso principal y que la impresión pasa al backend. La prueba de escritorio de la etapa 1 deberá confirmar el arranque del sidecar y la impresión de un recibo real antes de construir los demás módulos.

Django aplicará permisos, validaciones, transacciones y reglas del negocio. Se ejecutará con un servidor local apropiado para la distribución, como Waitress, propuesto por su compatibilidad con Windows. El servidor de desarrollo de Django no se usará para la entrega.

El backend escuchará solamente en la interfaz local del computador. El empaquetado deberá resolver autenticación local, credencial efímera por inicio o mecanismo equivalente, restricciones de origen y protección de solicitudes. La ventana de React solo tendrá los permisos de Tauri que se declaren explícitamente en sus capacidades, con una política de seguridad de contenido restrictiva; no recibirá acceso general al sistema de archivos, a la ejecución de comandos ni a las credenciales administrativas del sistema. Las contraseñas usarán el mecanismo de hash de Django.

| Alternativa considerada | Ventaja | Costo o limitación | Uso propuesto |
| --- | --- | --- | --- |
| Escritorio local con SQLite | Arranque sencillo y operación sin internet | Un equipo operativo y respaldos propios | Base de esta propuesta |
| Escritorio con PostgreSQL local centralizado | Mejor encaje para varios puestos | Servicio adicional y administración | Si se confirma operación simultánea |
| React y Django alojados con PostgreSQL remoto | Acceso desde distintos lugares | Alojamiento recurrente e internet | Ampliación si el negocio la necesita |

La decisión aceptada en la conversación es avanzar con SQLite para la modalidad local. El uso de un solo equipo es una hipótesis pendiente de confirmar. Cambiar después a PostgreSQL requerirá migración y pruebas de datos y concurrencia; no se promete un cambio automático.

## 8 Almacenamiento y recuperación

### 8 1 Ubicación de los datos

Confirmado con el dueño: la información se guardará en el disco duro del computador. La instalación y los datos estarán separados. La aplicación propondrá una carpeta de datos del usuario de Windows y permitirá elegir otra ubicación local con permisos adecuados. La base activa no se ubicará en una carpeta sincronizada, unidad de red ni memoria extraíble. Las copias generadas sí podrán enviarse a esos destinos cuando corresponda.

Cambiar la ubicación será una operación guiada: suspender escrituras, crear una copia consistente, trasladar datos y adjuntos, verificar la apertura y conservar la ubicación anterior hasta confirmar el cambio. Si falta la carpeta elegida, el programa mostrará un error claro y no creará silenciosamente una base vacía.

### 8 2 Política propuesta de respaldos

El respaldo incluirá una copia consistente de SQLite obtenida con su mecanismo de backup, los archivos adjuntos necesarios y un manifiesto con versión de esquema, aplicación, fecha e integridad. No bastará con copiar el archivo activo mientras se están registrando operaciones. Se verificará la integridad antes de informar éxito.

Se propone copia cada hora mientras el equipo esté encendido, además de una copia al cerrar cuando sea posible y una copia previa a actualizar o restaurar. Los intervalos y la retención serán configurables. Como punto de partida se propone conservar 24 copias horarias y 30 diarias, revisando el espacio real disponible.

Habrá al menos una copia fuera del disco principal. Puede ser un disco externo o un destino remoto configurado. El responsable deberá escoger y comprobar ese destino. Una carpeta en otra partición del mismo disco no protege frente a una falla física de ese disco.

Si no hay internet o el disco externo está desconectado, se conservará la copia local pendiente de envío y se mostrará la antigüedad del último respaldo externo correcto. El programa no ejecutará tareas con el computador apagado. Las copias externas sensibles se cifrarán y se definirá cómo custodiar la clave de recuperación.

### 8 3 Opciones de respaldo externo

La base de un negocio de este tamaño ocupará pocos megabytes durante años, así que el espacio no es una limitación. Lo importante es que la copia salga del computador y que alguien compruebe que existe.

| Opción | Cómo funciona | Ventajas | Cuidados | Costo aproximado |
| --- | --- | --- | --- | --- |
| Google Drive para escritorio | El programa deja la copia cifrada en una carpeta que Google Drive sincroniza | Automática, fuera del local, fácil de usar en Windows | Requiere internet; solo se sincronizan las copias, nunca la base activa | Gratis hasta 15 GB |
| OneDrive | Igual que Google Drive, ya viene en Windows | Integrado en Windows, sin instalar nada | Mismos cuidados; revisar que no se sincronice la carpeta de datos activa | Gratis hasta 5 GB |
| Memoria USB o disco externo | El programa copia al conectar la unidad o al cerrar el día | No depende de internet, recuperación rápida | Hay que conectarlo y guardarlo fuera del local; se recomiendan dos unidades que se alternan | Pago único por la unidad |
| Almacenamiento en la nube compatible con S3 (Backblaze B2, Cloudflare R2) | El programa sube la copia directamente | Muy confiable, historial de versiones, no depende de una carpeta sincronizada | Configuración más técnica y credenciales que custodiar | Centavos de dólar al mes para este volumen |

Recomendación: combinar dos destinos externos.

1. **Copia automática a Google Drive o OneDrive.** Se envía cifrada cada hora y al cerrar la jornada. Protege contra robo, incendio o daño del computador sin que nadie tenga que acordarse.
2. **Memoria USB semanal.** Se usan dos memorias que se alternan, y la que no está en uso se guarda fuera del local o en casa del dueño. Sirve si no hay internet o si la cuenta en la nube tiene problemas.

El programa mostrará en el inicio la fecha del último respaldo externo correcto de cada destino, con una alerta si pasan más de 24 horas sin copia en la nube o más de 7 días sin copia en la memoria USB. La opción S3 queda como alternativa si el dueño prefiere no depender de una cuenta personal de Google o Microsoft. La contraseña de cifrado de las copias debe anotarse y guardarse en un lugar seguro distinto del computador; sin ella no se podrá restaurar.

### 8 4 Restauración y continuidad

Restaurar requerirá permiso administrativo, validar el archivo, comprobar compatibilidad, detener operaciones y respaldar primero el estado actual. Se restaurará a una ubicación temporal y se verificará antes de reemplazar los datos. La prueba de aceptación incluirá recuperación en otro computador Windows con una instalación limpia.

Con respaldos horarios podría faltar hasta aproximadamente una hora de operaciones si todas las copias se realizaron correctamente. Si hubo fallos o el respaldo externo estaba desconectado, la pérdida posible será mayor. No se prometerá pérdida cero. La restauración de un respaldo no envía automáticamente sus cambios a otras instalaciones.

## 9 Modelo de datos propuesto

Alex, responsable del backend, administrará el esquema mediante modelos y migraciones de Django. El SQL directo se reservará para consultas justificadas y parametrizadas. Se evitarán cambios manuales de tablas que no estén reflejados en las migraciones.

| Grupo | Entidades principales | Relación o propósito |
| --- | --- | --- |
| Configuración | BusinessSettings, User, Role, AuditEvent | Negocio, permisos y trazabilidad |
| Catálogo | Category, Brand, Product, ProductCompatibility | Identificación de referencias y aplicaciones |
| Inventario | InventoryBalance, InventoryMovement | Saldo y entradas o salidas justificadas |
| Compras | Supplier, Purchase, PurchaseItem, SupplierPayment | Compras, recepción y pagos |
| Clientes | Customer | Contacto opcional del cliente |
| Ventas | Sale, SaleItem, CustomerPayment, PaymentAllocation | Documento, conceptos y aplicación de cobros |
| Taller | ServiceType | Tipos de servicio; cada servicio se registra como línea de venta |
| Empleados | Employee, DailyMechanicSettlement | Porcentaje y liquidación diaria pagada |
| Caja | CashSession, CashMovement, Expense, OwnerWithdrawal | Operación de caja, gastos y retiros |
| Correcciones | Return, ReturnItem, Reversal | Devoluciones y compensaciones vinculadas |
| Documentos | DocumentSequence, PrintEvent, Attachment | Numeración, reimpresión y adjuntos |
| Cierres | DailyClosing, MonthlyClosing | Cierre diario y resumen mensual |
| Recuperación | BackupRun, BackupDestination | Historial y estado de respaldos |

Cada movimiento de inventario conservará producto, cantidad con signo, tipo, documento de origen, costo aplicado, usuario, fecha y motivo cuando corresponda. Se podrá reconstruir y conciliar el saldo desde los movimientos del mes abierto; tras el cierre de mes, el saldo de cierre pasa a ser el saldo inicial del mes siguiente. Los ajustes físicos exigirán causa; no se modificará una cantidad sin dejar trazabilidad.

CustomerPayment registrará los cobros y PaymentAllocation los aplicará a las ventas. Las asignaciones impedirán aplicar más dinero del disponible o superar el saldo pendiente.

SaleItem conservará descripción, precio, descuento, impuesto si aplica y costo al momento de la operación. Cambiar el catálogo no alterará documentos anteriores. Los repuestos usados en un servicio serán líneas de producto de la misma venta, con su movimiento de salida.

Los importes confirmados se almacenarán en unidades monetarias menores enteras y se calcularán con Decimal en el backend, con reglas explícitas de redondeo. No se usarán números de punto flotante binario para sumar dinero. Las cantidades serán unidades enteras, porque los productos se venden solo en su presentación de fábrica. Product tendrá un indicador de insumo de taller para los productos que se consumen internamente y se cubren con la mano de obra.

SaleItem de tipo servicio guardará como campos obligatorios el tipo de servicio (ServiceType), la placa y el mecánico (Employee). DailyMechanicSettlement guardará por mecánico y día el total de mano de obra, el porcentaje aplicado y el valor pagado. MonthlyClosing guardará el resumen del mes. Employee tendrá su porcentaje vigente de mano de obra.

Se usarán identificadores internos independientes del número visible de documento. Habrá restricciones para referencias únicas, números de documentos y claves de reintento. Los campos obligatorios, índices y relaciones se documentarán en un diccionario de datos del backend. Fechas técnicas se almacenarán consistentemente y se presentarán según la zona horaria configurada del negocio, inicialmente America/Bogota como propuesta.

## 10 API y coordinación entre frontend y backend

La API tendrá el prefijo /api/v1 y un contrato OpenAPI versionado. Juan y Alex acordarán campos, estados, errores y ejemplos antes de construir cada pantalla. El frontend podrá trabajar con respuestas simuladas ajustadas a ese contrato mientras se implementa Django.

| Área | Endpoints orientativos | Responsable del backend |
| --- | --- | --- |
| Sesión | POST /auth/login, POST /auth/logout, GET /auth/me | Autenticación y permisos |
| Catálogo | GET y POST /products, PATCH /products/{id} | Filtros, referencias y validación |
| Inventario | GET /inventory/movements, POST /inventory/adjustments | Trazabilidad y ajustes |
| Compras | POST /purchases, POST /purchases/{id}/receive | Recepción transaccional |
| Ventas | POST /sales, POST /sales/{id}/confirm | Totales, existencias e idempotencia |
| Cobros | POST /payments, GET /receivables | Aplicación a documentos y saldos |
| Servicios | GET /service-types; los servicios se envían dentro de POST /sales | Tipo de servicio, placa y mecánico |
| Liquidación | GET y POST /mechanic-settlements/daily | Cálculo y pago diario por mecánico |
| Cierres | POST /closings/month, GET /closings/{id}/export?format=xlsx o pdf | Resumen mensual y exportación |
| Caja | POST /cash-sessions/open, POST /cash-sessions/{id}/close | Movimientos y conciliación |
| Correcciones | POST /returns, POST /sales/{id}/void | Validación y compensaciones |
| Reportes | GET /reports/sales, GET /reports/inventory, con exportación a Excel y PDF | Cálculos, filtros y archivos |
| Documentos | GET /sales/{id}/document | Datos inmutables para impresión |
| Respaldos | GET /backups, POST /backups, POST /restore/validate | Estado y operaciones restringidas |

Las rutas son una propuesta de contrato, no endpoints implementados. La selección de carpetas y los diálogos de Windows serán responsabilidad de Tauri; el acceso al sistema de archivos se expondrá de forma limitada. La restauración efectiva se coordinará con el proceso principal para cerrar conexiones y reiniciar el backend con seguridad.

Los listados tendrán paginación, búsqueda y ordenación. Los errores devolverán código estable, mensaje comprensible y errores por campo cuando apliquen. Se distinguirán errores de validación, permisos y conflictos de operación. Un reintento de confirmación conservará el mismo identificador y devolverá el resultado ya registrado.

El backend será la autoridad de precios, permisos, cantidades y totales. La interfaz enviará identificadores y cantidades y mostrará el cálculo confirmado por Django. Las operaciones críticas se ejecutarán en transacciones cortas; imprimir, enviar respaldos o esperar interacción humana quedará fuera de ellas.

## 11 Distribución del trabajo entre dos personas

Roles confirmados: Juan está a cargo de la parte visual y de las tareas que se le asignan abajo. Alex está a cargo del backend.

| Frente | Juan: parte visual y escritorio | Alex: backend |
| --- | --- | --- |
| Requisitos | Recoger con el dueño cómo trabaja en mostrador y validar las pantallas con él | Revisar que las reglas del negocio sean consistentes y completas |
| Interfaz | React: navegación, venta rápida, registro de servicios, formularios, tablas, mensajes de error y navegación con teclado | Contrato API con campos, errores y ejemplos de respuesta |
| Datos | Consumir la API y mostrar los resultados confirmados por Django | Modelos, migraciones, restricciones, índices y diccionario de datos |
| Negocio | Mostrar los flujos de venta, servicio, devolución y cierres sin permitir dobles clics | Transacciones, inventario, caja, liquidación diaria, devoluciones y cierre de mes |
| Escritorio | Tauri: ventana, inicio, carpetas, instancia única y permisos de la ventana | Sidecar de Django: arranque, comprobación de disponibilidad y cierre seguro desde Tauri |
| Recibos e informes | Diseño del recibo de 80 mm, de la liquidación diaria y prueba física en la impresora | Datos de los documentos, envío ESC/POS a la impresora y generación de los informes en Excel y PDF |
| Inventario inicial | Plantilla de conteo y pantalla de carga del inventario global | Importación validada y movimiento de inventario inicial |
| Respaldos | Pantalla de configuración, avisos de último respaldo y restauración guiada | Copia consistente, cifrado, envío a destinos, validación, restauración y borrado automático del detalle del mes |
| Pruebas | Flujos completos en Windows y pruebas de aceptación con el dueño | Pruebas de reglas, dinero, integridad y API |
| Entrega | Instalador generado por Tauri y guía de uso para el dueño y los vendedores | Empaquetado Python con PyInstaller, migraciones controladas y diagnóstico |

Se propone un único repositorio con carpetas frontend, backend, desktop y docs. La especificación de la API y los ejemplos vivirán en docs. Cada cambio se hará en una rama corta y la revisará el otro integrante antes de integrarla: Alex revisa los cambios de Juan y Juan los de Alex. No se subirán datos reales de clientes, contraseñas ni respaldos al repositorio.

Alex entregará migraciones reproducibles, datos ficticios de prueba, contrato API y pruebas de operaciones críticas. Juan entregará pantallas integradas, estados de carga y error, impresión, instalador y pruebas de interacción. Ambos serán responsables de que el instalador funcione en un Windows limpio.

En cada sesión de coordinación se revisarán tres puntos: qué flujo completo ya funciona, qué contrato cambió y qué bloqueo necesita al otro integrante. Se evitará desarrollar durante semanas con contratos diferentes. Los cambios de campos o estados deben actualizar contrato, datos de ejemplo y pruebas relacionadas.

## 12 Desarrollo en Linux y entrega en Windows

El desarrollo diario se realizará en Linux con entornos separados de Python, Node y Rust; Tauri funciona en Linux con WebKitGTK, así que las pantallas se podrán probar allí, aunque el aspecto final se validará con WebView2 en Windows. Se fijarán versiones compatibles al iniciar el proyecto y se conservarán archivos de dependencias reproducibles. Ambos integrantes trabajarán con la misma estructura y datos ficticios.

Una primera prueba temprana empaquetará una pantalla sencilla y un backend que lea y escriba un dato local. Su objetivo será verificar desde el comienzo el arranque de Tauri, el sidecar de Python, las carpetas de Windows, la impresión de un recibo de prueba y la persistencia después de reiniciar. Así se evaluará la parte más sensible antes de construir todos los módulos.

El paquete Python podrá generarse con PyInstaller en Windows y se copiará como sidecar con el nombre que Tauri exige para la plataforma, por ejemplo backend-x86_64-pc-windows-msvc.exe. Después, el empaquetador de Tauri generará el instalador para Windows en formato NSIS o MSI, con el instalador de WebView2 incluido. Podemos utilizar un computador Windows, una máquina virtual o un ejecutor de integración continua Windows. El acceso a ese entorno sigue pendiente de resolver.

El instalador incluirá las dependencias necesarias para el usuario final. La actualización hará respaldo previo, ejecutará migraciones controladas y comprobará que el backend arranque. Si una migración falla, se bloqueará el uso y se ofrecerá una recuperación guiada; no se abrirá una base incompleta. Se decidirán formato de instalador, arquitectura de Windows y mecanismo de actualización en la fase de empaquetado.

## 13 Etapas y entregables verificables

Las etapas indican dependencias y resultados, no fechas comprometidas. La duración se estimará después de confirmar disponibilidad de ambos integrantes, alcance de impresión y acceso a Windows.

| Etapa | Resultado esperado | Criterio para avanzar |
| --- | --- | --- |
| 0 Definición | Reglas pendientes, alcance y contrato inicial | Ambos pueden explicar el mismo flujo de compra y venta |
| 1 Prueba de escritorio | Tauri, Django como sidecar y SQLite instalables | Un dato persiste después de cerrar y reiniciar en Windows y se imprime un recibo de prueba |
| 2 Catálogo y compras | Productos, proveedores, recepción e inventario inicial | Una recepción aumenta exactamente las existencias correctas |
| 3 Ventas y caja | Venta, cobro, abono, gastos y cierre | Inventario, saldos y caja concilian sin duplicados |
| 4 Servicios y mecánicos | Servicio como venta y liquidación diaria | El repuesto se descuenta una vez y el mecánico recibe su porcentaje exacto |
| 5 Documentos, reportes y cierres | Recibo de 80 mm, informes en Excel y PDF, cierre de mes | El cierre de mes cuadra con los cierres diarios |
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
| Servicio con repuesto | El repuesto se descuenta una vez y no entra en el porcentaje del mecánico |
| Liquidación diaria | Con 60 %, el mecánico recibe el 60 % de su mano de obra del día |
| Cierre de mes | El resumen y los archivos Excel y PDF cuadran con los cierres diarios |
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

La modalidad local evita pagar un servidor para mantener la aplicación operativa. React, Django, Tauri y SQLite no requieren comprar una licencia de uso para este planteamiento, sujeto a conservar los avisos y condiciones de sus dependencias. Seguirán existiendo costos de desarrollo, soporte, equipo, energía, impresora, consumibles y el destino de respaldo elegido.

No se compromete un servicio de nube ni una tarifa anual en esta propuesta. El almacenamiento remoto de copias se cotizará cuando el dueño elija proveedor, capacidad y retención. La firma del instalador, si se contrata, será otro concepto. El acceso remoto y la facturación electrónica, si se solicitan, se presupuestarán por separado.

Decisiones confirmadas con el dueño el 29 de octubre de 2026:

| Decisión | Resultado |
| --- | --- |
| Uno o varios computadores | Un solo computador |
| Sistema operativo | Windows |
| Datos del servicio | Tipo de servicio, placa y mecánico que lo realizó |
| Registro del servicio | Se negocia, se realiza y se registra como venta con el valor final; se imprime el recibo |
| Remuneración de mecánicos | Porcentaje de la mano de obra, por ejemplo 60 % mecánico y 40 % local; repuestos 100 % local; se paga al final de cada día |
| Liquidación diaria | Se guarda solo cuánto le correspondió a cada mecánico ese día |
| Tipo de documento de venta | Recibo de compra sin facturación electrónica |
| Impresora | Impresora térmica de recibos, papel de 80 mm |
| Productos a granel | No hay; se vende la presentación de fábrica en unidades enteras |
| Insumos de poca cantidad | Incluidos en la mano de obra, sin cobro separado |
| Impuestos | No se reflejan en el sistema |
| Saldos iniciales | Inventario global del negocio al iniciar el programa |
| Almacenamiento | Disco duro del computador |
| Cierre de mes | Se guarda el resumen: costos, ganancia y totales pagados a mecánicos; el detalle se conserva un mes más y se elimina automáticamente al cerrar el mes siguiente |
| Devoluciones de servicios | Si el dueño concluye que hubo mala instalación o mal servicio, se le descuenta al mecánico en su siguiente pago la mano de obra devuelta y los repuestos que no pueden volver al inventario; los que vuelven en buen estado no se le descuentan; si la causa es otra, la asume el local |
| Informes | Excel y PDF |

Decisiones que siguen pendientes:

| Decisión | Motivo | Propuesta inicial |
| --- | --- | --- |
| Modelo de impresora | Prueba física de corte y cajón | Cualquier térmica de 80 mm compatible con ESC/POS y con controlador para Windows |
| Destino externo de respaldo | Determina recuperación y costos | Google Drive u OneDrive automático y dos memorias USB alternadas |
| Entorno Windows de pruebas | Necesario para instalar y validar | Equipo o máquina virtual disponible desde el inicio |
| Datos del negocio para el recibo | Encabezado del recibo | Nombre, dirección, teléfono y NIT o cédula si el dueño lo desea |
| Horas disponibles de Juan y Alex | Permite estimar calendario | Estimar por entregables |

La reunión puede seguir este orden: revisar el objetivo y el flujo completo; confirmar la arquitectura local; acordar responsabilidades; resolver las decisiones pendientes; seleccionar el primer entregable y fijar la próxima revisión. La primera implementación propuesta es un instalador mínimo con persistencia y respaldo verificables, seguido del ciclo de catálogo, compra y venta.

## 16 Fuentes técnicas de referencia

Las fuentes respaldan las decisiones de arquitectura y deben revisarse al fijar las versiones del proyecto. No sustituyen las pruebas de integración ni la confirmación de los requisitos del negocio.

1. Tauri 2. Introducción a aplicaciones de escritorio. https://v2.tauri.app/start/
2. Django. Bases de datos compatibles y límites de SQLite. https://docs.djangoproject.com/en/5.2/ref/databases/
3. SQLite. Usos adecuados y comparación con bases cliente servidor. https://sqlite.org/whentouse.html
4. SQLite. Transacciones. https://sqlite.org/transactional.html
5. SQLite. API de respaldo en línea. https://www.sqlite.org/backup.html
6. Django REST Framework. Autenticación y permisos. https://www.django-rest-framework.org/api-guide/authentication/
7. Tauri 2. Seguridad, permisos y capacidades. https://v2.tauri.app/security/
8. PyInstaller. Empaquetado por sistema operativo. https://pyinstaller.org/en/stable/
9. Tauri 2. Binarios externos (sidecar). https://v2.tauri.app/develop/sidecar/
10. Tauri 2. Instalador para Windows y WebView2. https://v2.tauri.app/distribute/windows-installer/
11. Waitress. Servidor WSGI para Python. https://docs.pylonsproject.org/projects/waitress/en/stable/
12. python-escpos. Impresión ESC/POS desde Python. https://python-escpos.readthedocs.io/

Consulta de documentación y preparación del informe: 29 de octubre de 2026; actualización a Tauri: 30 de octubre de 2026.
