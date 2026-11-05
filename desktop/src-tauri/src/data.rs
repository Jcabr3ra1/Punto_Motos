use std::{fs, io::Write, path::Path};

pub fn prepare(data: &Path, marker: &Path) -> Result<(), String> {
    if marker
        .try_exists()
        .map_err(|e| format!("No se pudo leer la configuración: {e}"))?
    {
        if fs::read_to_string(marker)
            .map_err(|e| format!("No se pudo leer la configuración: {e}"))?
            != "1\n"
        {
            return Err(
                "La marca de datos no es válida. Revisa la configuración antes de continuar."
                    .into(),
            );
        }
        for name in ["punto_moto.sqlite3", "secret_key"] {
            let path = data.join(name);
            if !path.is_file() || fs::metadata(&path).map(|m| m.len() == 0).unwrap_or(true) {
                return Err(format!("Faltan los datos existentes en {}. No se creará una base nueva. Revisa la carpeta antes de abrir el programa.", data.display()));
            }
        }
    } else {
        fs::create_dir_all(data).map_err(|e| {
            format!(
                "No se pudo preparar la carpeta de datos {}: {e}",
                data.display()
            )
        })?;
    }
    Ok(())
}

pub fn mark_ready(marker: &Path) -> Result<(), String> {
    fs::create_dir_all(marker.parent().ok_or("Ruta de configuración inválida")?)
        .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(marker)
    {
        Ok(mut file) => file
            .write_all(b"1\n")
            .and_then(|_| file.sync_all())
            .map_err(|e| format!("No se pudo guardar la configuración de datos: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(format!("No se pudo guardar la configuración de datos: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn first_launch_creates_only_the_data_directory() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("datos");
        let marker = temp.path().join("config/initialized");
        prepare(&data, &marker).unwrap();
        assert!(data.is_dir());
        assert!(!data.join("punto_moto.sqlite3").exists());
        assert!(!marker.exists());
    }

    #[test]
    fn reopening_keeps_existing_files_unchanged() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("datos");
        let marker = temp.path().join("config/initialized");
        fs::create_dir_all(&data).unwrap();
        fs::write(data.join("punto_moto.sqlite3"), b"datos-ficticios").unwrap();
        fs::write(data.join("secret_key"), b"clave-ficticia").unwrap();
        mark_ready(&marker).unwrap();
        assert!(marker.is_file());
        prepare(&data, &marker).unwrap();
        assert_eq!(
            fs::read(data.join("punto_moto.sqlite3")).unwrap(),
            b"datos-ficticios"
        );
    }

    #[test]
    fn missing_directory_after_initialization_is_not_recreated() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("datos");
        let marker = temp.path().join("config/initialized");
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(&marker, b"1\n").unwrap();
        assert!(prepare(&data, &marker).is_err());
        assert!(!data.exists());
    }

    #[test]
    fn missing_database_or_secret_is_rejected_without_changing_files() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("datos");
        let marker = temp.path().join("initialized");
        fs::create_dir_all(&data).unwrap();
        fs::write(&marker, b"1\n").unwrap();
        assert!(prepare(&data, &marker).is_err());
        fs::write(data.join("punto_moto.sqlite3"), b"datos-ficticios").unwrap();
        assert!(prepare(&data, &marker).is_err());
        assert!(!data.join("secret_key").exists());
    }
}
