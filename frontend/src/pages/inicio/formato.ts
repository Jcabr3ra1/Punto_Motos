/** Los datos de Inicio se refrescan solos cada minuto mientras está abierto. */
export const CADA_MINUTO = 60_000

const formatoDeDia = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })

/** «sábado, 7 de noviembre» → «Sábado 7 de noviembre». */
export function diaLargo(fecha: Date): string {
  const texto = formatoDeDia.format(fecha).replace(',', '')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const formatoDeHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })

/** «8:02 a. m.»; vacío si la fecha no se puede leer, para no romper la pantalla. */
export function horaDe(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? '' : formatoDeHora.format(fecha)
}

/** «8 a. m.», «12 p. m.», «6 p. m.». */
export function horaLegible(hora: number): string {
  const doce = hora % 12 === 0 ? 12 : hora % 12
  return `${doce} ${hora < 12 ? 'a. m.' : 'p. m.'}`
}

export const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`
