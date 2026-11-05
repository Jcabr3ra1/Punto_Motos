fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_status",
            "check_update",
            "install_update",
        ]),
    ))
    .expect("No se pudo preparar Tauri");
}
