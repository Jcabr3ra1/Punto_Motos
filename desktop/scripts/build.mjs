import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { desktop, environment, root } from './doctor.mjs'
import { prepareRelease } from './release-assets.mjs'

const config = JSON.parse(readFileSync(join(desktop, 'src-tauri/tauri.conf.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'))
const cargo = readFileSync(join(desktop, 'src-tauri/Cargo.toml'), 'utf8')
if (pkg.version !== config.version || !cargo.includes(`version = "${config.version}"`)) throw new Error('Las versiones de Tauri, Cargo y package.json deben coincidir.')
const keyPath = join(root, '.release-keys/updater.key')
const signingKey = process.env.TAURI_SIGNING_PRIVATE_KEY || (existsSync(keyPath) ? readFileSync(keyPath, 'utf8').trim() : '')
if (!signingKey) throw new Error('Falta TAURI_SIGNING_PRIVATE_KEY. No se genera un instalador sin firma de actualizaciones.')
function run(file, args, env = environment) {
  const result = spawnSync(file, args, { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(process.execPath, [join(desktop, 'scripts/package-backend.mjs')])
run(process.execPath, [join(desktop, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--config', join(desktop, 'src-tauri/tauri.release.conf.json'), '--bundles', 'nsis'], {
  ...environment, CI: 'true', TAURI_SIGNING_PRIVATE_KEY: signingKey, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
})
const output = join(desktop, 'src-tauri/target/release/bundle/nsis')
const notes = readFileSync(join(root, 'docs/RELEASE_NOTES.md'), 'utf8')
prepareRelease(output, { version: config.version, notes })
console.log(`Instalador firmado y manifiesto listos en ${output}`)
