mod backend;
mod data;
mod updates;

use backend::{DesktopStatus, Launch, Runtime};
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

#[tauri::command]
fn desktop_status(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<Runtime>>,
) -> Result<DesktopStatus, String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    Ok(state.status())
}

pub fn run() {
    let runtime = Runtime::new();
    let shutdown = Arc::clone(&runtime);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(Arc::clone(&runtime))
        .manage(updates::Updates::default())
        .invoke_handler(tauri::generate_handler![
            desktop_status,
            updates::check_update,
            updates::install_update
        ])
        .setup(move |app| {
            let launch = (|| -> Result<Launch, String> {
                let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
                let python = std::env::var_os("PUNTO_MOTO_PYTHON")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| {
                        root.join(if cfg!(windows) {
                            "backend/.venv/Scripts/python.exe"
                        } else {
                            "backend/.venv/bin/python"
                        })
                    });
                let (python, script) = if cfg!(debug_assertions) {
                    (python, root.join("backend/run.py"))
                } else {
                    (
                        std::env::current_exe()
                            .map_err(|e| e.to_string())?
                            .parent()
                            .ok_or("No se encontró la instalación")?
                            .join("backend.exe"),
                        PathBuf::new(),
                    )
                };
                Ok(Launch {
                    data: app
                        .path()
                        .app_local_data_dir()
                        .map_err(|e| e.to_string())?
                        .join("data"),
                    marker: app
                        .path()
                        .app_config_dir()
                        .map_err(|e| e.to_string())?
                        .join("desktop-initialized"),
                    python,
                    script,
                })
            })();
            match launch {
                Ok(launch) => runtime.start(launch),
                Err(message) => runtime.fail(message),
            }
            Ok(())
        })
        .build(tauri::generate_context!());
    match app {
        Ok(app) => app.run(move |_, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                shutdown.stop();
            }
        }),
        Err(error) => {
            shutdown.stop();
            eprintln!("No se pudo abrir Punto Moto: {error}");
        }
    }
}
