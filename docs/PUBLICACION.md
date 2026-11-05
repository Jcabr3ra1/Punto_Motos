# Publicar y actualizar Punto Moto

## Qué se publica

El repositorio y sus Releases son públicos. Cada versión incluye el instalador NSIS para Windows x64, su firma de actualización (`.sig`), `latest.json` y `SHA256SUMS.txt`. Se publican binarios, código y documentación; nunca bases reales, claves privadas, entornos Python ni respaldos.

La aplicación consulta `https://github.com/Jcabr3ra1/Punto_Motos/releases/latest/download/latest.json`. No lleva credenciales GitHub del desarrollador. El dueño ve las actualizaciones desde Inicio y decide cuándo instalarlas. Se actualizan conjuntamente frontend, Django y escritorio.

## Clave de actualizaciones

La clave pública está en `desktop/src-tauri/tauri.conf.json`. La privada se guarda localmente en `.release-keys/updater.key`, ignorada por Git, y como secreto de Actions `TAURI_SIGNING_PRIVATE_KEY`. Haz una copia segura de la clave privada fuera del repositorio. No la pegues en incidencias, mensajes ni archivos versionados; no regeneres una clave para cada versión.

El par inicial utiliza contraseña vacía; si se usa una clave con contraseña, configura también `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en Actions y en el entorno local. Las versiones ya instaladas solo aceptan paquetes firmados con su clave de confianza. Perder esa clave impide continuar la cadena normal de actualización.

La firma de Tauri no es un certificado Authenticode de editor de Windows. El instalador inicial puede mostrar aviso de editor desconocido. No se ha contratado ni configurado certificado comercial.

## Generar localmente

Instala los requisitos de [desktop/README.md](../desktop/README.md) y las dependencias de `backend/requirements-build.txt`.

```powershell
cd desktop
npm.cmd run build
```

El comando valida versiones, empaqueta Django con PyInstaller, compila React/Rust, genera NSIS y firma el instalador. Usa `TAURI_SIGNING_PRIVATE_KEY` del entorno o, localmente, el archivo ignorado `.release-keys/updater.key`. La salida queda en `desktop/src-tauri/target/release/bundle/nsis/`.

No se debe publicar únicamente el ejecutable Rust: el instalador incluye `backend.exe`, los recursos React y el mecanismo de actualización.

## Publicar otra versión

1. Cambia a una versión superior (por ejemplo `0.1.1`) en `desktop/package.json`, `desktop/package-lock.json` (raíz y `packages[""]`), `desktop/src-tauri/Cargo.toml` y `desktop/src-tauri/tauri.conf.json`. Actualiza Cargo.lock ejecutando Cargo y comprueba que no queden versiones discordantes.
2. Actualiza `docs/RELEASE_NOTES.md` con cambios concretos y pendientes. Si cambió el backend, actualiza también API, CAMBIOS y su README.
3. Ejecuta pruebas, revisión y construcción local. Comprueba que no se incluyen claves ni datos reales.
4. Sube los cambios revisados y una etiqueta `v<versión>` al repositorio.
5. El workflow **Instalador de Windows** prueba, compila, firma y comprueba Django congelado. Solo después crea la Release pública con sus archivos. Revisa el resultado en Actions.

También puede ejecutarse manualmente el workflow para generar artefactos de prueba; desde una rama no crea una Release. No sobrescribas los binarios de una versión existente: corrige el problema y publica una versión superior. No cambies el identificador `com.puntomoto.desktop` ni las rutas de datos.

## Datos y migraciones

Los datos están en `%LOCALAPPDATA%\com.puntomoto.desktop\data\`; la marca de inicialización en `%APPDATA%\com.puntomoto.desktop\desktop-initialized`. No se incluyen en el instalador ni se eliminan para actualizarlo.

Antes de una migración pendiente sobre una base existente, Django realiza un respaldo consistente en `data/backups/pre-migration/<fecha-id>/`, con SQLite, `secret_key` y manifiesto de integridad y hashes. Si falla la copia, no migra. Un fallo de migración bloquea el arranque; no se ofrece recuperación automática ni se abre silenciosamente una base vacía.

Para recuperación manual: cierra Punto Moto, conserva una copia del estado fallido, verifica los hashes e integridad del respaldo y restaura la base y su `secret_key` juntos, usando una versión de aplicación compatible con ese esquema. No copies encima de una base abierta. Si no puedes verificar esos pasos, no reemplaces archivos: solicita soporte con el registro de `data/logs/backend.log`, sin adjuntar datos ni claves en un repositorio público.

Las copias locales previas a migraciones aún no tienen retención automática y no protegen de una falla física del disco. Los respaldos externos siguen pendientes.

## Alcance de las comprobaciones

Las pruebas automatizadas cubren conservación de datos, arranque/cierre de Django, backend congelado y estados de actualización de la interfaz. La primera Release permite instalar y detectar las futuras versiones, pero no demuestra por sí sola una actualización real entre dos versiones publicadas. Antes de distribuir cambios de esquema del negocio, prueba la actualización sobre una instalación anterior y una copia ficticia de datos.
