import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export function prepareRelease(output, { version, notes, pubDate = new Date().toISOString() }) {
  const original = readdirSync(output).find((name) => name.endsWith(`_${version}_x64-setup.exe`))
  if (!original || !existsSync(join(output, `${original}.sig`))) throw new Error('Falta el instalador o su firma.')
  // GitHub transforma los espacios en puntos al subir assets. Publicamos ya el
  // nombre normalizado para que URL, firma y checksums coincidan con la descarga.
  const installer = original.replaceAll(' ', '.')
  if (installer !== original) {
    renameSync(join(output, original), join(output, installer))
    renameSync(join(output, `${original}.sig`), join(output, `${installer}.sig`))
  }
  const manifest = {
    version, notes, pub_date: pubDate,
    platforms: { 'windows-x86_64': {
      signature: readFileSync(join(output, `${installer}.sig`), 'utf8').trim(),
      url: `https://github.com/Jcabr3ra1/Punto_Motos/releases/download/v${version}/${encodeURIComponent(installer)}`,
    } },
  }
  writeFileSync(join(output, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const checksums = [installer, `${installer}.sig`, 'latest.json'].map((name) =>
    `${createHash('sha256').update(readFileSync(join(output, name))).digest('hex')}  ${name}`).join('\n')
  writeFileSync(join(output, 'SHA256SUMS.txt'), checksums + '\n')
}
