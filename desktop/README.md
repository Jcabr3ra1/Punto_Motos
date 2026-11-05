# Desktop

Punto Moto utiliza Tauri 2 en Windows x64. La versión instalada incluye React y Django con Python empaquetado: no requiere instalar herramientas de desarrollo en el computador del negocio.

## Descargar

Abre [la última Release](https://github.com/Jcabr3ra1/Punto_Motos/releases/latest) y descarga `Punto Moto_<versión>_x64-setup.exe`. El instalador NSIS es por usuario y utiliza WebView2. Si WebView2 no está instalado, necesita internet para completar ese requisito.

## Preparación del desarrollo

Requiere Node 24+, Rust estable (1.90+), Python 3.12+, Visual Studio Build Tools con C++ y SDK de Windows y WebView2. Consulta los [requisitos oficiales de Tauri](https://v2.tauri.app/start/prerequisites/).

Desde la raíz, en PowerShell:

```powershell
npm.cmd ci --prefix frontend
npm.cmd ci --prefix desktop
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-build.txt
cd desktop
npm.cmd run doctor
npm.cmd run dev
```

Si `python` abre Microsoft Store, usa un Python ya instalado para crear el entorno. No hay que activar el entorno, migrar manualmente ni abrir Django por separado. Puedes definir `PUNTO_MOTO_PYTHON` con la ruta absoluta a otro Python con las dependencias del backend; solo se utiliza en desarrollo.

`doctor` comprueba requisitos y `dev` agrega Cargo al PATH de ese proceso sin modificar el sistema. La primera compilación tarda varios minutos. Cierra cualquier Vite previo en 5173 antes de ejecutar el escritorio. Tauri administra su Vite y Django; cierra la ventana o usa Ctrl+C en su terminal para terminar el desarrollo.

## Instalador y actualizaciones

```powershell
# Dentro de desktop/, con la clave de firma configurada
npm.cmd run package:backend  # solo Django congelado
npm.cmd run build            # backend, frontend, Rust, NSIS, firma y latest.json
```

La configuración base permite desarrollar sin un sidecar precompilado. `tauri.release.conf.json` añade el binario y el instalador al construir. Los archivos generados no se versionan. El backend compilado se instala como `backend.exe` junto al programa.

El dueño ve la búsqueda automática y el botón de consulta en **Inicio → Actualizaciones del programa**. Confirma cuándo instalar, después de guardar sus operaciones. El programa descarga y verifica el paquete antes de detener Django. Si falla la descarga, permanece disponible. Si falla la ejecución del instalador después del cierre del backend, hay que cerrar y volver a abrir Punto Moto.

Las actualizaciones desde la interfaz solo se ejecutan en la versión instalada, no en debug. La clave pública y el endpoint GitHub están en la configuración base; la privada nunca se versiona. Consulta [PUBLICACION.md](../docs/PUBLICACION.md) para generar, firmar y publicar las próximas versiones.

## Datos y seguridad

Identificador permanente: `com.puntomoto.desktop`.

- SQLite y clave Django: `%LOCALAPPDATA%\com.puntomoto.desktop\data\`.
- Marca de inicialización: `%APPDATA%\com.puntomoto.desktop\desktop-initialized`.
- Registro del backend instalado: `data/logs/backend.log`.
- Copias previas a migraciones: `data/backups/pre-migration/`.

Los datos están fuera del repositorio y de los binarios; no se trasladan automáticamente desde `backend/.data`. Tras el primer arranque correcto, si faltan base, clave o carpeta, el programa informa el error y no las sustituye silenciosamente. No borres la marca para resolver problemas de datos.

Antes de migraciones pendientes sobre una base existente, Django guarda y verifica una copia consistente con su clave y un manifiesto. Si falla, no migra. Las copias externas, retención y restauración guiada siguen pendientes.

La API escucha solo en loopback con un puerto disponible y credencial aleatoria por apertura. Rust entrega la configuración a React antes de que consulte la API; ninguna credencial se guarda en localStorage. El cambio de versión conserva los datos pero exige iniciar sesión nuevamente.

La aplicación permite una sola instancia. En Windows, Python se crea suspendido, se asigna a un Job Object y después se reanuda: al salir se cierra también su árbol de procesos. La salud tiene un plazo de 60 segundos. La ventana solo tiene permisos para consultar el arranque y las actualizaciones; instalar una actualización valida además la sesión de dueño contra Django. No tiene acceso general a archivos ni ejecución arbitraria de procesos.

## Comprobaciones

```powershell
# Desde la raíz, con Cargo en PATH
cargo test --manifest-path desktop/src-tauri/Cargo.toml
cargo fmt --manifest-path desktop/src-tauri/Cargo.toml --check
npm.cmd test --prefix frontend
npm.cmd run lint --prefix frontend
npm.cmd run build --prefix frontend
backend/.venv/Scripts/python.exe backend/manage.py test

# Después de package:backend
cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib frozen_backend_boots_and_reopens_without_python -- --ignored
```

Las pruebas usan datos ficticios temporales, nunca la base del usuario. La prueba frozen comprueba el backend sin Python del proyecto. La primera Release debe distinguirse de una prueba real de actualización entre dos versiones publicadas; esa comprobación se hará antes de entregar cambios de esquema al negocio.

## Estructura

- `scripts/`: diagnóstico, desarrollo y empaquetado reproducible.
- `src-tauri/src/lib.rs`: ventana, permisos de arranque e instancia única.
- `src-tauri/src/backend.rs`: proceso, salud y cierre.
- `src-tauri/src/data.rs`: protección de datos existentes.
- `src-tauri/src/updates.rs`: consulta, autorización y actualización firmada.
- `src-tauri/tauri.conf.json`: identidad, ventana, CSP, clave pública y endpoint.
- `src-tauri/tauri.release.conf.json`: sidecar y NSIS.
- `src-tauri/capabilities/`: comandos permitidos a la ventana principal.
- `.github/workflows/release.yml`: pruebas y publicación por etiqueta.
