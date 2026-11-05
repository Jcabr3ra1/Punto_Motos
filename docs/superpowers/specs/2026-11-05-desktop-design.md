# Primera integración de escritorio

## Objetivo y decisiones

Ejecutar Punto Moto en Windows con Tauri 2, reutilizando el frontend React y el backend Django existentes. El usuario propone dejar el instalador para el final; esta fase se centra en ejecutar y comprobar la aplicación en desarrollo.

La arquitectura Tauri + Django local está definida en el informe y los README. La propuesta técnica de este documento requiere revisión del usuario antes de implementarse.

## Alternativas

- **Tauri administra Django desde el inicio (recomendada):** permite probar el ciclo real de la aplicación y las credenciales. En desarrollo utiliza el Python del entorno virtual; el ejecutable de PyInstaller se incorpora en una fase posterior.
- **Abrir React en Tauri y ejecutar Django manualmente:** permite ver una ventana antes, pero deja sin comprobar el arranque, la disponibilidad y el cierre del backend. No cumple por sí sola el objetivo de integrar el escritorio.

Se conserva Tauri 2, ya elegido por el proyecto. No se propone cambiar de plataforma.

## Alcance de la primera fase

1. Proyecto Tauri bajo `desktop/`, ventana nativa con título Punto Moto, tamaño inicial aproximado de 1280 × 800 y mínimo de 900 × 560.
2. Comando documentado para iniciar el desarrollo con Vite y Tauri. Requisitos: Node compatible con el frontend, Rust, herramientas C++ de Windows, WebView2 y entorno Python con las dependencias del backend.
3. El proceso Rust inicia `backend/run.py` mediante el Python del entorno virtual. Solo inicia un backend propio; no se conecta silenciosamente a otro que ya esté escuchando.
4. Puerto local disponible, credencial aleatoria nueva por arranque y conexión exclusivamente a `127.0.0.1`. Rust entrega la dirección y la credencial al frontend mediante un comando Tauri limitado a la ventana principal, antes de montar los flujos que consultan la API. Las credenciales permanecen en memoria y no se registran en los mensajes.
5. Estado de arranque visible. Se comprueba `/api/v1/health` con la credencial y un plazo máximo definido antes de habilitar el acceso. Si el proceso falla o no responde, se muestra un error comprensible y la aplicación permite cerrarse sin dejar un proceso huérfano. No se inicia otro backend en cada reintento de consulta.
6. Instancia única para impedir que dos aperturas administren la misma base. La segunda apertura enfoca la primera ventana.
7. Datos de escritorio separados de `backend/.data`, en una carpeta local del usuario administrada por Tauri. Una marca persistente de inicialización distingue la primera apertura de una carpeta que desapareció: tras la primera apertura, si faltan la carpeta o la base existente, se informa el error sin sustituirlas por una base vacía. No se trasladan datos existentes automáticamente.
8. Cierre del proceso hijo al salir y limpieza si falla la preparación de la ventana. Se comprueba en Windows que no queda el backend propio activo. No se detienen procesos ajenos.
9. Capacidades mínimas y política de contenido que permite la API local y los recursos necesarios para Vite en desarrollo. El frontend no recibe permisos generales para ejecutar comandos ni leer archivos.
10. La ejecución habitual del frontend en navegador continúa disponible.

## Fuera de esta fase

Instalador NSIS/MSI, empaquetado Python con PyInstaller, distribución de WebView2, actualizaciones, inicio con Windows, selector y traslado de carpeta de datos, respaldos e impresión. Estas funciones se incorporarán después de comprobar la integración; impresión y respaldos también requieren trabajo pendiente en el backend.

No se modifica el contrato de negocio de la API. Si durante la implementación es imprescindible cambiar el backend, se actualizarán `docs/backend/API.md`, `docs/backend/CAMBIOS.md` y las instrucciones afectadas de acuerdo con `CLAUDE.md`.

## Flujo de apertura

Tauri obtiene la exclusión de instancia → valida la carpeta de datos → genera la credencial y elige el puerto → inicia Django → comprueba salud → configura el cliente React → muestra el asistente inicial o el acceso existente. Un error detiene el avance y explica qué revisar.

En cada apertura Django conserva el comportamiento actual: aplica migraciones e invalida las sesiones anteriores. La integración no introduce usuarios ni datos de negocio de prueba automáticamente.

## Verificación y aceptación

- Compilación y comprobaciones de Rust y del frontend, y pruebas específicas de inicialización y de configuración del cliente antes de las consultas.
- Arranque real en Windows sin iniciar Django manualmente; acceso al asistente o inicio de sesión.
- Registrar un dato ficticio, cerrar, comprobar que el proceso termina y volver a abrir para verificar persistencia y solicitud de una sesión nueva.
- Segunda apertura: solo queda una instancia y se enfoca la ventana existente.
- Fallos de Python, arranque agotado y datos desaparecidos: error visible sin reemplazo de datos ni procesos huérfanos.
- Confirmar que el frontend sigue funcionando en navegador y que ningún token aparece en archivos o registros.

Los resultados se documentan distinguiendo las comprobaciones ejecutadas de las que no puedan realizarse por requisitos ausentes del entorno. Esta fase no se presenta como instalador listo para distribución.

## Decisiones de implementación delegadas

Las bibliotecas compatibles con Tauri 2, el puerto disponible, los nombres internos, el texto de los errores y el plazo exacto de arranque quedan a criterio del implementador. Se propone un plazo inicial de 60 segundos y una ruta de datos estándar del usuario. El instalador se aborda después de aceptar esta fase.
