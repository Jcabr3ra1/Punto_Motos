import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const root = resolve(desktop, '..')
export const environment = { ...process.env, PATH: `${join(homedir(), '.cargo', 'bin')}${delimiter}${process.env.PATH ?? ''}` }
export const python = process.env.PUNTO_MOTO_PYTHON
  ? resolve(process.env.PUNTO_MOTO_PYTHON)
  : join(root, 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

export function diagnose() {
  const checks = [
    [Number(process.versions.node.split('.')[0]) >= 24, 'Node 24 o superior'],
    [spawnSync('cargo', ['--version'], { env: environment, windowsHide: true }).status === 0, 'Rust estable (rustup)'],
    [existsSync(join(desktop, 'node_modules/@tauri-apps/cli/tauri.js')), 'Dependencias desktop: npm install en desktop/'],
    [existsSync(join(root, 'frontend/node_modules/vite')), 'Dependencias frontend: npm ci en frontend/'],
    [existsSync(python) && spawnSync(python, ['-c', 'import django, waitress, rest_framework'], { windowsHide: true }).status === 0,
      'Entorno backend/.venv con backend/requirements.txt (o PUNTO_MOTO_PYTHON)'],
  ]
  if (process.platform === 'win32') {
    const vswhere = join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe')
    const vs = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true })
    checks.push([vs.status === 0 && Boolean(vs.stdout?.trim()), 'Visual Studio Build Tools: C++ para escritorio y SDK de Windows'])
  }
  for (const [ok, label] of checks) console.log(`${ok ? 'OK' : 'FALTA'}  ${label}`)
  console.log('La primera compilación puede tardar varios minutos. WebView2 debe estar instalado en Windows.')
  return checks.every(([ok]) => ok)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = diagnose() ? 0 : 1
}
