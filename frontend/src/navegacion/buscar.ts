import type { Role } from '../api/types'
import { DESTINOS, MENU_PRINCIPAL, SUBMENUS, puedeVer, type Destino } from './destinos'

export interface Resultado {
  destino: Destino
  /** El módulo del menú donde está la pantalla (el mismo destino si no tiene submenú). */
  modulo: Destino
}

/** Minúsculas y sin tildes: «Liquidación» y «liquidacion» son lo mismo para quien busca. */
export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

// Las pantallas a las que se puede ir, con su módulo. Los módulos con submenú no son una pantalla en sí.
const PANTALLAS: readonly Resultado[] = MENU_PRINCIPAL.flatMap((modulo) =>
  (SUBMENUS[modulo.ruta] ?? [modulo]).map((destino) => ({ destino, modulo })),
)

/**
 * Pantallas que coinciden con el texto, solo las que el rol puede ver. Primero las que coinciden por nombre, después
 * por descripción y al final por el módulo; dentro de cada grupo, en el orden del menú. Se compara por el comienzo
 * de las palabras.
 */
export function buscarPantallas(texto: string, rol: Role, conteoAbierto: boolean): Resultado[] {
  const buscado = normalizar(texto)
  const visibles = PANTALLAS.filter(
    ({ destino }) =>
      puedeVer(destino, rol) && (destino !== DESTINOS.inventarioInicial || conteoAbierto),
  )
  if (!buscado) return [...visibles]

  const terminos = buscado.split(/\s+/)
  // Cada palabra buscada debe ser el comienzo de alguna palabra del texto: «ca» encuentra «Caja», no «Locales».
  const coincide = (texto: string) => {
    const palabras = normalizar(texto).split(/[^\p{L}\p{N}]+/u)
    return terminos.every((termino) => palabras.some((palabra) => palabra.startsWith(termino)))
  }

  const puntaje = ({ destino, modulo }: Resultado) => {
    if (normalizar(destino.etiqueta).startsWith(buscado)) return 0
    if (coincide(destino.etiqueta)) return 1
    if (coincide(`${destino.etiqueta} ${destino.descripcion}`)) return 2
    if (modulo !== destino && coincide(`${modulo.etiqueta} ${modulo.descripcion} ${destino.etiqueta}`)) return 3
    return null
  }

  return visibles
    .map((resultado, orden) => ({ resultado, orden, puntaje: puntaje(resultado) }))
    .filter((r): r is typeof r & { puntaje: number } => r.puntaje !== null)
    .sort((a, b) => a.puntaje - b.puntaje || a.orden - b.orden)
    .map((r) => r.resultado)
}
