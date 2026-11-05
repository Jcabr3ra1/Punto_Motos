import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { desktop, diagnose, environment } from './doctor.mjs'

if (!diagnose()) {
  console.error('Completa los requisitos indicados y vuelve a ejecutar npm run dev. Consulta desktop/README.md.')
  process.exitCode = 1
} else {
  const cli = spawn(process.execPath, [join(desktop, 'node_modules/@tauri-apps/cli/tauri.js'), 'dev', ...process.argv.slice(2)], {
    cwd: desktop,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  })
  cli.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
  cli.on('exit', (code) => { process.exitCode = code ?? 1 })
  // Tauri administra Vite y el proceso Rust; Rust administra exclusivamente su Django.
  // En Windows el propio CLI recibe Ctrl+C de la consola y limpia Vite.
  // ChildProcess.kill('SIGINT') lo terminaría sin dejar ejecutar esa limpieza.
  if (process.platform !== 'win32') {
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cli.kill(signal) })
  }
}
