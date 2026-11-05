import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareRelease } from './release-assets.mjs'

test('el manifiesto y los hashes usan el nombre público que acepta GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'punto-release-'))
  try {
    writeFileSync(join(dir, 'Punto Moto_0.1.0_x64-setup.exe'), 'abc')
    writeFileSync(join(dir, 'Punto Moto_0.1.0_x64-setup.exe.sig'), 'firma-ficticia')
    prepareRelease(dir, { version: '0.1.0', notes: 'Prueba', pubDate: '2026-11-05T00:00:00Z' })
    const manifest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'))
    assert.equal(manifest.platforms['windows-x86_64'].url,
      'https://github.com/Jcabr3ra1/Punto_Motos/releases/download/v0.1.0/Punto.Moto_0.1.0_x64-setup.exe')
    assert.equal(manifest.platforms['windows-x86_64'].signature, 'firma-ficticia')
    assert.ok(existsSync(join(dir, 'Punto.Moto_0.1.0_x64-setup.exe')))
    assert.ok(!existsSync(join(dir, 'Punto Moto_0.1.0_x64-setup.exe')))
    assert.ok(readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8').includes(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  Punto.Moto_0.1.0_x64-setup.exe'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
