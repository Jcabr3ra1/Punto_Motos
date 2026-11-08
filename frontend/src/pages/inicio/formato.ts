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
