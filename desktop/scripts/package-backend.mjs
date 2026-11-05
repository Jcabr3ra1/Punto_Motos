import { mkdirSync, mkdtempSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { root, desktop, python } from './doctor.mjs'

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('El instalador actual se genera en Windows x64.')
const buildDir = join(root, 'backend/build')
mkdirSync(buildDir, { recursive: true })
const analysisData = mkdtempSync(join(buildDir, 'analysis-'))
const result = spawnSync(python, ['-m', 'PyInstaller', '--noconfirm', '--distpath', join(root, 'backend/dist'), '--workpath', buildDir, join(root, 'backend/backend.spec')], {
  cwd: join(root, 'backend'), env: { ...process.env, PUNTO_MOTO_DATA_DIR: analysisData, PUNTO_MOTO_TOKEN: 'build-analysis-only' }, stdio: 'inherit', windowsHide: true,
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
mkdirSync(join(desktop, 'src-tauri/binaries'), { recursive: true })
copyFileSync(join(root, 'backend/dist/backend.exe'), join(desktop, 'src-tauri/binaries/backend-x86_64-pc-windows-msvc.exe'))
console.log('Backend empaquetado para Windows x64.')
