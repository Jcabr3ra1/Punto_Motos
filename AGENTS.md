# Punto Moto: guía para colaboradores y agentes

Este repositorio contiene una aplicación Windows con React/TypeScript, Tauri 2 y Django/SQLite empaquetado. El código y las descargas son públicos en `Jcabr3ra1/Punto_Motos`. Escribir código, documentación y mensajes de la aplicación en español, siguiendo el estilo existente.

## Antes de trabajar

- Leer [CLAUDE.md](CLAUDE.md): reglas del proyecto y documentación obligatoria del backend.
- Consultar [README.md](README.md), [desktop/README.md](desktop/README.md) y [docs/PUBLICACION.md](docs/PUBLICACION.md).
- Revisar el estado de Git y conservar los cambios existentes de otras personas. Respetar las decisiones y el alcance autorizado por el usuario.
- No presentar como implementados los módulos pendientes indicados en README y notas de versión.

## Cómo llegan los cambios a un programa ya instalado

**Modificar código o subir un commit a GitHub NO actualiza las instalaciones existentes.** Hay que publicar una versión nueva del instalador. Esa versión contiene juntos React, Django y escritorio, aunque solo haya cambiado uno.

1. Implementar y comprobar el cambio. Documentar cambios del backend según `CLAUDE.md`.
2. Elegir una versión de escritorio superior a la última Release publicada. Consultar GitHub; no reutilizar una etiqueta existente.
3. Mantener coherentes `desktop/package.json`, las versiones raíz de `desktop/package-lock.json`, `desktop/src-tauri/Cargo.toml`, la entrada del paquete propio en `Cargo.lock` y `desktop/src-tauri/tauri.conf.json`.
4. Actualizar `docs/RELEASE_NOTES.md` y subir el código revisado.
5. Dentro del alcance autorizado, crear y subir la etiqueta `v<versión>`. El workflow `.github/workflows/release.yml` ejecuta pruebas, compila, firma y publica instalador, firma, `latest.json` y checksums.
6. Esperar el resultado de Actions y comprobar que la Release y sus archivos se descargan públicamente. No afirmar que una actualización está publicada solo porque existe la etiqueta.

El dueño busca actualizaciones desde **Inicio → Actualizaciones del programa**. Se consultan al montar esa pantalla y al pulsar **Buscar actualizaciones**. Se necesita internet para buscar y descargar. Se muestra **Actualizar y reiniciar** cuando GitHub anuncia una versión superior; el usuario elige cuándo instalarla. No interrumpir ventas con instalaciones silenciosas.

La versión del instalador es independiente de `APP_VERSION` de Django y de la versión interna del paquete frontend. No renombrar versiones del contrato backend solo para hacerlas coincidir con el instalador.

## Invariantes de distribución y datos

- Mantener el identificador `com.puntomoto.desktop`, las rutas de datos y el endpoint público del actualizador descritos en `docs/PUBLICACION.md`.
- Los datos viven fuera de la instalación. No borrar ni reemplazar automáticamente la base ni su marca de inicialización para resolver un fallo.
- La API solo escucha en `127.0.0.1` con una credencial efímera por apertura. La sesión del usuario y la credencial del programa son distintas y permanecen en memoria.
- Antes de migraciones pendientes sobre una base existente, el arranque realiza un respaldo SQLite consistente y verificado. No saltarse ese paso ni presentar las copias locales como respaldos externos completos.
- No publicar bases, respaldos, credenciales ni claves privadas. No mostrar su contenido en respuestas, logs, issues o commits.
- La firma debe conservar la misma clave de confianza. **Si otro colaborador clona el repo y no tiene `.release-keys/`, no debe generar otra clave para reemplazar la existente.** Usar el workflow con el secreto `TAURI_SIGNING_PRIVATE_KEY` ya configurado, o solicitar al responsable la configuración local por un canal privado. La clave privada no puede recuperarse leyendo un secreto de GitHub.
- No sustituir los binarios de una versión publicada. Para cambios del programa, publicar una versión superior.

## Empaquetado e identidad visual

- `desktop/scripts/build.mjs` genera Django congelado, compila Tauri/React y crea NSIS firmado. `desktop/scripts/release-assets.mjs` normaliza nombres para que GitHub no rompa las URLs: los assets públicos usan `Punto.Moto_<versión>_x64-setup.exe`.
- La configuración base es de desarrollo; `tauri.release.conf.json` añade el sidecar e instalador. No distribuir solo el ejecutable Rust.
- El logo original está en `frontend/public/logo.png`. Los recursos Windows están en `desktop/src-tauri/icons/`.
- `bundle.icon` configura el icono de la aplicación. NSIS necesita además `installerIcon` y `uninstallerIcon`; el asistente usa `headerImage` y `sidebarImage`. No quitar esas propiedades: de lo contrario vuelve el icono predeterminado del instalador.

## Comprobaciones

Preparar el entorno según `desktop/README.md`. En Windows usar `npm.cmd` si PowerShell bloquea `npm.ps1`.

Ejecutar las comprobaciones adecuadas al cambio. Las suites existentes son frontend (`npm.cmd test --prefix frontend`), backend (`backend/.venv/Scripts/python.exe backend/manage.py test`) y Rust (`cargo test --manifest-path desktop/src-tauri/Cargo.toml`). Para empaquetado, comprobar también `node --test desktop/scripts/release-assets.test.mjs`, build firmado y la prueba frozen documentada. Revisar visualmente los recursos cuando cambie la identidad del instalador.

Los cambios solo documentales no requieren recompilar ni publicar un instalador. Nunca afirmar que una prueba, instalación, actualización o publicación pasó sin haber observado su resultado. Distinguir la primera instalación de una actualización real entre dos versiones.
