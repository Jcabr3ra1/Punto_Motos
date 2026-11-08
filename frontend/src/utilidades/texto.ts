/** Minúsculas y sin tildes, para buscar sin importar cómo se escribió: «revision» encuentra «Revisión». */
export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
