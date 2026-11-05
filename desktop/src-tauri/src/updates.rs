use crate::backend::{DesktopStatus, Runtime};
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::{Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates {
    pending: Mutex<Option<Update>>,
    installing: AtomicBool,
}

#[derive(Serialize)]
pub struct AvailableUpdate {
    version: String,
    notes: Option<String>,
}

#[tauri::command]
pub async fn check_update(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, Updates>,
) -> Result<Option<AvailableUpdate>, String> {
    if window.label() != "main" {
        return Err("Ventana no autorizada".into());
    }
    let runtime = app.state::<Arc<Runtime>>().inner().clone();
    let mut pending = app
        .updater_builder()
        .timeout(Duration::from_secs(12))
        .on_before_exit(move || {
            runtime.stop();
        })
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|_| "No se pudo consultar GitHub Releases")?;
    if let Some(update) = pending.as_mut() {
        update.timeout = Some(Duration::from_secs(300));
    }
    let result = pending.as_ref().map(|u| AvailableUpdate {
        version: u.version.clone(),
        notes: u.body.clone(),
    });
    *state
        .pending
        .lock()
        .map_err(|_| "No se pudo consultar el estado")? = pending;
    Ok(result)
}

#[tauri::command]
pub async fn install_update(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, Updates>,
    session_token: String,
) -> Result<(), String> {
    if window.label() != "main" || cfg!(debug_assertions) {
        return Err("Solo se actualiza la versión instalada desde la ventana principal.".into());
    }
    if state
        .installing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Ya hay una actualización en curso.".into());
    }
    let result = async {
        let config = match app.state::<Arc<Runtime>>().status() {
            DesktopStatus::Ready { config } => config,
            _ => return Err("Django debe estar disponible antes de actualizar.".to_string()),
        };
        let response = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| "No se pudo comprobar la sesión")?
            .get(format!("{}/auth/me", config.base_url))
            .header("X-Punto-Moto-Token", config.app_token)
            .header("Authorization", format!("Token {session_token}"))
            .send()
            .await
            .map_err(|_| "No se pudo comprobar la sesión")?;
        if !response.status().is_success() {
            return Err("Inicia sesión como dueño para actualizar.".into());
        }
        let user: serde_json::Value = response.json().await.map_err(|_| "Sesión inválida")?;
        if user["role"] != "owner" {
            return Err("Solo el dueño puede actualizar.".into());
        }
        let update = state
            .pending
            .lock()
            .map_err(|_| "Estado no disponible")?
            .clone()
            .ok_or("Busca primero una actualización")?;
        // download valida la firma antes de ejecutar on_before_exit o tocar Django.
        let bytes = update
            .download(|_, _| {}, || {})
            .await
            .map_err(|_| "Falló la descarga o su firma; el programa sigue disponible.")?;
        update.install(bytes).map_err(|_| {
            "No se pudo ejecutar el instalador. Cierra y vuelve a abrir el programa."
        })?;
        Ok(())
    }
    .await;
    state.installing.store(false, Ordering::SeqCst);
    result
}
