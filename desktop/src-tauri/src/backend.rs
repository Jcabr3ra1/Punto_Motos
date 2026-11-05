use rand::RngCore;
use serde::Serialize;
use std::{
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

pub struct ManagedChild {
    child: Child,
    #[cfg(windows)]
    job: Option<std::os::windows::io::OwnedHandle>,
}

impl ManagedChild {
    pub fn spawn(command: &mut Command) -> Result<Self, String> {
        let child = spawn_child(command)?;
        let mut owned = Self {
            child,
            #[cfg(windows)]
            job: None,
        };
        #[cfg(windows)]
        {
            owned.job = Some(windows_job(&owned.child)?);
            resume_child(&owned.child)?;
        }
        Ok(owned)
    }

    fn check_running(&mut self) -> Result<(), String> {
        match self.child.try_wait() {
            Ok(None) => Ok(()),
            Ok(Some(code)) => Err(format!("Django se cerró ({code}). Revisa las dependencias y la salida de la terminal; después cierra y vuelve a abrir la aplicación.")),
            Err(e) => Err(format!("No se pudo comprobar el proceso de Django: {e}")),
        }
    }
}

fn spawn_child(command: &mut Command) -> Result<Child, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, CREATE_SUSPENDED};
        // Impide que el lanzador del venv cree un hijo antes de entrar al Job.
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
    }
    command
        .spawn()
        .map_err(|e| format!("No se pudo iniciar Python: {e}"))
}

#[cfg(windows)]
fn resume_child(child: &Child) -> Result<(), String> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::{
        Foundation::INVALID_HANDLE_VALUE,
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD,
                THREADENTRY32,
            },
            Threading::{OpenThread, ResumeThread, THREAD_SUSPEND_RESUME},
        },
    };
    // El proceso sigue suspendido: solo existe su hilo inicial, que std::process
    // no expone. Lo recuperamos por PID con las APIs documentadas de Windows.
    unsafe {
        let raw = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
        if raw == INVALID_HANDLE_VALUE {
            return Err(format!(
                "No se pudo preparar el inicio de Python: {}",
                std::io::Error::last_os_error()
            ));
        }
        let snapshot = OwnedHandle::from_raw_handle(raw);
        let mut entry: THREADENTRY32 = std::mem::zeroed();
        entry.dwSize = std::mem::size_of_val(&entry) as u32;
        let mut found = Thread32First(snapshot.as_raw_handle(), &mut entry);
        while found != 0 {
            if entry.th32OwnerProcessID == child.id() {
                let raw_thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                if raw_thread.is_null() {
                    return Err(format!(
                        "No se pudo abrir el hilo de Python: {}",
                        std::io::Error::last_os_error()
                    ));
                }
                let thread = OwnedHandle::from_raw_handle(raw_thread);
                if ResumeThread(thread.as_raw_handle()) == u32::MAX {
                    return Err(format!(
                        "No se pudo iniciar el hilo de Python: {}",
                        std::io::Error::last_os_error()
                    ));
                }
                return Ok(());
            }
            found = Thread32Next(snapshot.as_raw_handle(), &mut entry);
        }
        Err("No se encontró el hilo inicial de Python.".into())
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        // El Job de Windows incluye también los hijos del lanzador del venv.
        #[cfg(windows)]
        drop(self.job.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[cfg(windows)]
fn windows_job(child: &Child) -> Result<std::os::windows::io::OwnedHandle, String> {
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
    use windows_sys::Win32::System::JobObjects::*;
    // Los handles son propios; OwnedHandle los cierra incluso si falla la asignación.
    unsafe {
        let raw = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if raw.is_null() {
            return Err(format!(
                "No se pudo proteger el proceso: {}",
                std::io::Error::last_os_error()
            ));
        }
        let job = OwnedHandle::from_raw_handle(raw);
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(
            raw,
            JobObjectExtendedLimitInformation,
            &limits as *const _ as *const _,
            std::mem::size_of_val(&limits) as u32,
        ) == 0
            || AssignProcessToJobObject(raw, child.as_raw_handle()) == 0
        {
            return Err(format!(
                "No se pudo proteger el cierre de Django: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(job)
    }
}

fn await_health(
    url: &str,
    token: &str,
    timeout: Duration,
    mut check: impl FnMut() -> Result<(), String>,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(2).min(timeout))
        .build()
        .map_err(|_| "No se pudo preparar la comprobación de Django")?;
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        check()?;
        if let Ok(response) = client.get(url).header("X-Punto-Moto-Token", token).send() {
            if response.status().is_success() {
                if let Ok(body) = response.json::<serde_json::Value>() {
                    if body["status"] == "ok" {
                        check()?;
                        return Ok(());
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("Django no respondió en el tiempo esperado. Revisa la salida de la terminal; después cierra y vuelve a abrir la aplicación.".into())
}

#[cfg(test)]
fn wait_ready(
    child: &mut ManagedChild,
    url: &str,
    token: &str,
    timeout: Duration,
) -> Result<(), String> {
    await_health(url, token, timeout, || child.check_running())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConfig {
    pub base_url: String,
    pub app_token: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "phase", rename_all = "lowercase")]
pub enum DesktopStatus {
    Starting,
    Ready { config: ApiConfig },
    Failed { message: String },
}

struct Inner {
    status: DesktopStatus,
    child: Option<ManagedChild>,
    stopped: bool,
}

pub struct Runtime(Mutex<Inner>);

pub struct Launch {
    pub data: PathBuf,
    pub marker: PathBuf,
    pub python: PathBuf,
    pub script: PathBuf,
}

impl Runtime {
    pub fn new() -> Arc<Self> {
        Arc::new(Self(Mutex::new(Inner {
            status: DesktopStatus::Starting,
            child: None,
            stopped: false,
        })))
    }

    pub fn status(&self) -> DesktopStatus {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .status
            .clone()
    }

    pub fn stop(&self) {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        inner.stopped = true;
        inner.child.take();
        inner.status = DesktopStatus::Failed {
            message: "El programa se está cerrando.".into(),
        };
    }

    pub fn fail(&self, message: String) {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        inner.child.take();
        inner.status = DesktopStatus::Failed { message };
    }

    pub fn start(self: &Arc<Self>, launch: Launch) {
        let runtime = Arc::clone(self);
        thread::spawn(move || {
            if let Err(message) = runtime.boot(launch) {
                runtime.fail(message);
            }
        });
    }

    fn check(&self) -> Result<(), String> {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if inner.stopped {
            return Err("El programa se está cerrando.".into());
        }
        inner
            .child
            .as_mut()
            .ok_or("Django no está iniciado")?
            .check_running()
    }

    fn boot(&self, launch: Launch) -> Result<(), String> {
        let standalone = launch.script.as_os_str().is_empty();
        if !launch.python.is_file() || (!standalone && !launch.script.is_file()) {
            return Err("No se encontró Python o backend/run.py. Prepara backend/.venv según desktop/README.md y vuelve a abrir la aplicación.".into());
        }
        crate::data::prepare(&launch.data, &launch.marker)?;
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("No se pudo reservar un puerto local: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let mut bytes = [0u8; 32];
        rand::rngs::OsRng
            .try_fill_bytes(&mut bytes)
            .map_err(|_| "No se pudo generar la credencial del programa")?;
        let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        let base_url = format!("http://127.0.0.1:{port}/api/v1");
        let mut command = Command::new(&launch.python);
        if !standalone {
            command.arg(&launch.script);
        }
        command
            .arg("--port")
            .arg(port.to_string())
            .current_dir(launch.python.parent().ok_or("Ruta de backend inválida")?)
            .env("PUNTO_MOTO_DATA_DIR", &launch.data)
            .env("PUNTO_MOTO_TOKEN", &token)
            .env("PUNTO_MOTO_DEBUG", "0")
            .env(
                "PUNTO_MOTO_ALLOWED_ORIGINS",
                "http://tauri.localhost,tauri://localhost,http://localhost:5173",
            )
            .env("PYTHONUNBUFFERED", "1")
            .stdin(Stdio::null());
        if standalone {
            let logs = launch.data.join("logs");
            std::fs::create_dir_all(&logs)
                .map_err(|e| format!("No se pudo preparar el registro: {e}"))?;
            let log = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(logs.join("backend.log"))
                .map_err(|e| format!("No se pudo abrir el registro: {e}"))?;
            command
                .stdout(log.try_clone().map_err(|e| e.to_string())?)
                .stderr(log);
        }
        {
            let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
            if inner.stopped {
                return Ok(());
            }
            // Se libera justo antes del spawn. La salud autenticada impide aceptar otro servidor.
            drop(listener);
            inner.child = Some(ManagedChild::spawn(&mut command)?);
        }
        await_health(
            &format!("{base_url}/health"),
            &token,
            Duration::from_secs(60),
            || self.check(),
        )?;
        {
            let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
            if inner.stopped {
                return Ok(());
            }
            crate::data::mark_ready(&launch.marker)?;
            inner.status = DesktopStatus::Ready {
                config: ApiConfig {
                    base_url,
                    app_token: token,
                },
            };
        }
        loop {
            thread::sleep(Duration::from_millis(500));
            self.check()?;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::Instant;

    fn python() -> Command {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../backend");
        let executable = if cfg!(windows) {
            ".venv/Scripts/python.exe"
        } else {
            ".venv/bin/python"
        };
        Command::new(root.join(executable))
    }

    #[cfg(windows)]
    #[test]
    fn windows_process_cannot_run_before_its_job_is_attached() {
        let temp = tempfile::tempdir().unwrap();
        let output = temp.path().join("executed");
        let mut command = python();
        command
            .args([
                "-c",
                "import pathlib,sys; pathlib.Path(sys.argv[1]).touch()",
            ])
            .arg(&output);
        let child = ManagedChild {
            child: spawn_child(&mut command).unwrap(),
            job: None,
        };
        thread::sleep(Duration::from_millis(500));
        assert!(
            !output.exists(),
            "Python debe permanecer suspendido antes de asignar el Job"
        );
        drop(child);
    }

    fn launch(temp: &tempfile::TempDir) -> Launch {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap();
        Launch {
            data: temp.path().join("data"),
            marker: temp.path().join("config/initialized"),
            python: root.join(if cfg!(windows) {
                "backend/.venv/Scripts/python.exe"
            } else {
                "backend/.venv/bin/python"
            }),
            script: root.join("backend/run.py"),
        }
    }

    fn ready(runtime: &Runtime) -> ApiConfig {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            match runtime.status() {
                DesktopStatus::Ready { config } => return config,
                DesktopStatus::Failed { message } => panic!("{message}"),
                DesktopStatus::Starting => {}
            }
            assert!(
                Instant::now() < deadline,
                "Django debería iniciar en la prueba"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    #[test]
    fn real_django_preserves_owner_and_invalidates_credentials_after_reopening() {
        let temp = tempfile::tempdir().unwrap();
        let runtime = Runtime::new();
        runtime.start(launch(&temp));
        let config = ready(&runtime);
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap();
        assert_eq!(
            client
                .get(format!("{}/health", config.base_url))
                .send()
                .unwrap()
                .status(),
            401
        );
        let created = client.post(format!("{}/setup/owner", config.base_url))
            .header("X-Punto-Moto-Token", &config.app_token)
            .json(&serde_json::json!({ "username": "prueba_desktop", "first_name": "Prueba", "last_name": "Ficticia", "password": "moto-prueba-local-2026" }))
            .send().unwrap();
        assert_eq!(created.status(), 201);
        let session: serde_json::Value = created.json().unwrap();
        runtime.stop();
        assert!(client
            .get(format!("{}/health", config.base_url))
            .send()
            .is_err());

        let reopened = Runtime::new();
        reopened.start(launch(&temp));
        let next = ready(&reopened);
        assert_ne!(next.app_token, config.app_token);
        let status: serde_json::Value = client
            .get(format!("{}/setup/status", next.base_url))
            .header("X-Punto-Moto-Token", &next.app_token)
            .send()
            .unwrap()
            .json()
            .unwrap();
        assert_eq!(status["needs_owner"], false);
        assert_eq!(
            client
                .get(format!("{}/auth/me", next.base_url))
                .header("X-Punto-Moto-Token", &next.app_token)
                .header(
                    "Authorization",
                    format!("Token {}", session["token"].as_str().unwrap())
                )
                .send()
                .unwrap()
                .status(),
            401
        );
        let login = client.post(format!("{}/auth/login", next.base_url))
            .header("X-Punto-Moto-Token", &next.app_token)
            .json(&serde_json::json!({ "username": "prueba_desktop", "password": "moto-prueba-local-2026" }))
            .send().unwrap();
        assert_eq!(login.status(), 200);
        reopened.stop();
    }

    #[test]
    #[ignore = "Requiere generar primero el backend con npm run package:backend"]
    fn frozen_backend_boots_and_reopens_without_python() {
        let temp = tempfile::tempdir().unwrap();
        for _ in 0..2 {
            let mut options = launch(&temp);
            options.python = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("binaries/backend-x86_64-pc-windows-msvc.exe");
            options.script = PathBuf::new();
            let runtime = Runtime::new();
            runtime.start(options);
            let config = ready(&runtime);
            let client = reqwest::blocking::Client::builder()
                .no_proxy()
                .build()
                .unwrap();
            let status: serde_json::Value = client
                .get(format!("{}/setup/status", config.base_url))
                .header("X-Punto-Moto-Token", &config.app_token)
                .send()
                .unwrap()
                .json()
                .unwrap();
            assert_eq!(status["needs_owner"], true);
            runtime.stop();
        }
        assert!(temp.path().join("data/punto_moto.sqlite3").is_file());
    }

    #[test]
    fn closing_before_start_never_launches_a_backend() {
        let temp = tempfile::tempdir().unwrap();
        let runtime = Runtime::new();
        runtime.stop();
        runtime.boot(launch(&temp)).unwrap();
        assert!(runtime.0.lock().unwrap().child.is_none());
        assert!(!temp.path().join("data/punto_moto.sqlite3").exists());
    }

    #[test]
    fn closing_while_health_is_pending_stops_the_process() {
        let temp = tempfile::tempdir().unwrap();
        let mut options = launch(&temp);
        options.script = temp.path().join("starting.py");
        std::fs::write(&options.script,
            "from pathlib import Path\nimport time\nPath(__file__).with_suffix('.ready').touch()\ntime.sleep(2)\nPath(__file__).with_suffix('.finished').touch()\n").unwrap();
        let runtime = Runtime::new();
        runtime.start(options);
        let deadline = Instant::now() + Duration::from_secs(5);
        while !temp.path().join("starting.ready").exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert!(temp.path().join("starting.ready").exists());
        runtime.stop();
        thread::sleep(Duration::from_millis(2200));
        assert!(!temp.path().join("starting.finished").exists());
        assert!(runtime.0.lock().unwrap().child.is_none());
        assert!(!temp.path().join("config/initialized").exists());
    }

    #[cfg(windows)]
    #[test]
    fn windows_guard_also_stops_descendants_of_the_python_launcher() {
        let temp = tempfile::tempdir().unwrap();
        let ready = temp.path().join("ready");
        let finished = temp.path().join("finished");
        let mut command = python();
        command.args(["-c", "import subprocess,sys,time; subprocess.Popen([sys.executable,'-c', 'import pathlib,sys,time; pathlib.Path(sys.argv[1]).touch(); time.sleep(2); pathlib.Path(sys.argv[2]).touch()',sys.argv[1],sys.argv[2]]); time.sleep(10)"])
            .arg(&ready).arg(&finished);
        let child = ManagedChild::spawn(&mut command).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ready.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert!(ready.exists());
        drop(child);
        thread::sleep(Duration::from_millis(2200));
        assert!(!finished.exists());
    }

    #[test]
    fn dropping_guard_stops_the_owned_process() {
        let temp = tempfile::tempdir().unwrap();
        let ready = temp.path().join("ready");
        let finished = temp.path().join("finished");
        let mut command = python();
        command.args(["-c", "import pathlib,sys,time; pathlib.Path(sys.argv[1]).touch(); time.sleep(2); pathlib.Path(sys.argv[2]).touch()"])
            .arg(&ready).arg(&finished);
        let child = ManagedChild::spawn(&mut command).unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !ready.exists() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert!(
            ready.exists(),
            "el proceso de prueba debe llegar a ejecutarse"
        );
        drop(child);
        thread::sleep(Duration::from_millis(2200));
        assert!(
            !finished.exists(),
            "el proceso debe terminar al liberar su guardia"
        );
    }

    #[test]
    fn process_exit_is_reported_before_the_startup_deadline() {
        let mut command = python();
        command.args(["-c", "raise SystemExit(7)"]);
        let mut child = ManagedChild::spawn(&mut command).unwrap();
        let before = Instant::now();
        assert!(wait_ready(
            &mut child,
            "http://127.0.0.1:1/health",
            "test",
            Duration::from_secs(5)
        )
        .is_err());
        assert!(before.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn health_requires_success_and_the_ephemeral_credential() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let url = format!("http://{}/health", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(4);
            let (mut stream, _) = loop {
                if let Ok(connection) = listener.accept() {
                    break connection;
                }
                if Instant::now() >= deadline {
                    return false;
                }
                thread::sleep(Duration::from_millis(10));
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut buffer = [0; 4096];
            let count = stream.read(&mut buffer).unwrap();
            let request = String::from_utf8_lossy(&buffer[..count]).to_lowercase();
            let authorized = request.contains("x-punto-moto-token: ficticia");
            let body = br#"{"status":"ok","version":"0.8.0"}"#;
            write!(
                stream,
                "HTTP/1.1 {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                if authorized {
                    "200 OK"
                } else {
                    "401 Unauthorized"
                },
                body.len()
            )
            .unwrap();
            stream.write_all(body).unwrap();
            authorized
        });
        let mut command = python();
        command.args(["-c", "import time; time.sleep(10)"]);
        let mut child = ManagedChild::spawn(&mut command).unwrap();
        assert!(wait_ready(&mut child, &url, "ficticia", Duration::from_secs(3)).is_ok());
        assert!(
            server.join().unwrap(),
            "salud debe llevar la credencial de este arranque"
        );
    }

    #[test]
    fn unresponsive_health_has_a_bounded_deadline() {
        let mut command = python();
        command.args(["-c", "import time; time.sleep(10)"]);
        let mut child = ManagedChild::spawn(&mut command).unwrap();
        let before = Instant::now();
        assert!(wait_ready(
            &mut child,
            "http://127.0.0.1:1/health",
            "ficticia",
            Duration::from_millis(200)
        )
        .is_err());
        assert!(before.elapsed() < Duration::from_secs(3));
    }
}
