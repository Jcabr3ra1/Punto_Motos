# Instalador y actualizaciones públicas

## Decisiones y autorización

El usuario pidió generar el instalador ahora, detectar actualizaciones desde el programa y publicar todo en el repositorio existente `Jcabr3ra1/Punto_Motos`. Indicó avanzar «todo de una vez». Se continúa sin otra ronda de aprobación de procedimiento.

## Enfoque

Se elige GitHub Releases público en el mismo repositorio frente a descargas manuales (no cumplen el aviso solicitado) o un servidor propio (añade infraestructura innecesaria). Windows x64, instalador NSIS por usuario, identidad estable `com.puntomoto.desktop`, datos en las rutas actuales. El paquete incluye React, Rust y Django congelado con PyInstaller; no requiere Python instalado.

El actualizador oficial Tauri consulta `releases/latest/download/latest.json` por HTTPS. El programa informa disponibilidad y ofrece actualizar desde Inicio al dueño, sin operaciones en curso. No instala silenciosamente durante ventas. El paquete se descarga y se verifica antes de detener Django. Si no hay internet o la descarga falla, se mantiene la aplicación disponible. La actualización reemplaza todos los componentes juntos; los datos se mantienen fuera de la instalación.

## Datos y recuperación

Antes de aplicar migraciones pendientes sobre una base existente, Django crea un respaldo consistente mediante sqlite3.backup, copia secret_key y guarda un manifiesto con fecha y versión. Se comprueba integridad; un error de respaldo bloquea las migraciones. Primera instalación sin base no requiere copia. La instalación de una versión anterior no revierte esquemas automáticamente: no se ofrecen downgrades automáticos. Una migración fallida bloquea el arranque y conserva la copia para recuperación manual documentada. Esta función no sustituye los respaldos externos del negocio.

## Firma y publicación

Clave de actualizaciones persistente fuera de archivos versionados; solo la pública se incluye en la aplicación. Los secretos de firma del flujo CI no se suben como archivos ni se imprimen. Una etiqueta `vX.Y.Z` debe coincidir con Cargo, Tauri y package.json. GitHub Actions prueba, empaqueta y publica instalador, firma, checksums y latest.json únicamente tras finalizar la compilación. No se publican artefactos sin comprobar.

Se verifica el estado público y el acceso de descarga. Se publica la primera versión funcional comprobada y se dejan las instrucciones para futuras entregas y custodia de claves. Si falta acceso a secretos o publicación, se termina y verifica primero todo el trabajo local y se identifica el paso externo pendiente sin presentarlo como realizado.

## Presentación del repositorio

README en español con identidad visual existente, descarga de la última versión, estado real, módulos disponibles, arranque de desarrollo y guía de publicación. No se inventa licencia ni se declara acabado lo pendiente. Datos reales, claves privadas, entornos y respaldos quedan excluidos del historial público y de los artefactos.

## Verificación

Pruebas de respaldo, fallo de copia e integridad; pruebas de UI de actualización sin internet, disponibilidad, confirmación y fallo de instalación; compilación y suite existente; arranque del backend congelado con datos ficticios; construcción NSIS y verificación de assets. Probar instalación y actualización conservando datos temporales si el entorno lo permite. La primera publicación por sí sola no demuestra una actualización entre dos versiones.
