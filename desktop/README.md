# Desktop

Responsable: **Juan**, con Alex en la integración del sidecar de Django.

Aplicación de escritorio con Tauri 2. Abre la ventana con la interfaz de `frontend/`, inicia el backend de Django como *sidecar* y genera el instalador para Windows. Ver las secciones [7](../docs/informe_proyecto_taller.md#7-arquitectura-de-escritorio-y-alternativas) y [12](../docs/informe_proyecto_taller.md#12-desarrollo-en-linux-y-entrega-en-windows) del informe.

## Tecnologías

- Tauri 2 con proceso principal en Rust.
- WebView2 en Windows (WebKitGTK al desarrollar en Linux).
- Plugins de Tauri para diálogos de carpetas, instancia única e inicio con Windows.
- Instalador NSIS o MSI con el instalador de WebView2 incluido.

## Responsabilidades

- Ventana, ícono, inicio y cierre de la aplicación.
- Arrancar el sidecar de Django, esperar a que responda antes de mostrar las pantallas y cerrarlo al salir.
- Generar la credencial efímera de cada inicio y entregarla al backend y a la interfaz.
- Selección de carpetas de datos y respaldos con los diálogos de Windows.
- Impedir dos instancias abiertas sobre los mismos datos.
- Permisos de la ventana: solo las capacidades declaradas y una política de seguridad de contenido restrictiva.
- Instalador, asistente inicial y actualización con respaldo previo.

## Estructura propuesta

```text
desktop/
  src-tauri/
    src/              # código Rust del proceso principal
    binaries/         # backend-x86_64-pc-windows-msvc.exe generado con PyInstaller
    capabilities/     # permisos de la ventana
    icons/
    tauri.conf.json   # frontendDist apunta a ../frontend/dist
    Cargo.toml
```

El ejecutable del sidecar no se sube al repositorio: se genera en el empaquetado.

## Primer entregable

La prueba de escritorio de la etapa 1: un instalador que abra una pantalla sencilla, arranque Django, guarde un dato en SQLite que persista después de reiniciar Windows e imprima un recibo de prueba.

## Estado

Carpeta preparada. El código todavía no está implementado.
