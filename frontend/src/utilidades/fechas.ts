/** Fecha y hora legibles en español, o `Nunca` si no hay valor. Recibe ISO 8601. */
export function formatearFechaHora(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

const formatoIsoColombia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })

/** Fecha de hoy en Colombia como `AAAA-MM-DD`, para los campos de fecha y los filtros. */
export function hoyEnColombia(): string {
  return formatoIsoColombia.format(new Date())
}

/** Día `AAAA-MM-DD` de un instante ISO 8601 visto en Colombia, o `null` si la fecha no es válida. */
export function diaEnColombia(iso: string): string | null {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? null : formatoIsoColombia.format(fecha)
}

/** Suma o resta días calendario sobre `AAAA-MM-DD` en UTC puro, sin desfases por zona horaria. */
export function moverDia(dia: string, desplazamiento: number): string {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, diaDelMes + desplazamiento)).toISOString().slice(0, 10)
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** Primer día del mes calendario de `AAAA-MM-DD`: `2026-11-08` → `2026-11-01`. */
export function inicioDeMes(dia: string): string {
  return `${dia.slice(0, 8)}01`
}

/**
 * Intervalo del mes calendario anterior del día 1 al mismo número de día,
 * limitado al último día real de aquel mes (p. ej. 28 o 29 de febrero, o 30 en abril).
 */
export function intervaloMesAnteriorComparable(hoy: string): { desde: string; hasta: string } {
  const [anio, mes, diaDelMes] = hoy.split('-').map(Number)
  const finMesPrevio = new Date(Date.UTC(anio, mes - 1, 0))
  const anioPrevio = finMesPrevio.getUTCFullYear()
  const mesPrevioIndice = finMesPrevio.getUTCMonth()
  const ultimoDia = finMesPrevio.getUTCDate()
  const desde = new Date(Date.UTC(anioPrevio, mesPrevioIndice, 1)).toISOString().slice(0, 10)
  const hasta = new Date(Date.UTC(anioPrevio, mesPrevioIndice, Math.min(diaDelMes, ultimoDia)))
    .toISOString()
    .slice(0, 10)
  return { desde, hasta }
}

/** Rango explícito en español sobre `AAAA-MM-DD` sin desfases horarios (`Del 1 al 28 de febrero`). */
export function formatearIntervaloDeFechas(desde: string, hasta: string, hoyReferencia?: string): string {
  const [anioD, mesD, diaD] = desde.split('-').map(Number)
  const [anioH, mesH, diaH] = hasta.split('-').map(Number)
  const anioRef = hoyReferencia ? Number(hoyReferencia.slice(0, 4)) : anioH

  if (desde === hasta) {
    const sufijoAnio = anioD !== anioRef ? ` de ${anioD}` : ''
    return `${diaD} de ${MESES_LARGOS[mesD - 1]}${sufijoAnio}`
  }
  if (anioD === anioH && mesD === mesH) {
    const sufijoAnio = anioH !== anioRef ? ` de ${anioH}` : ''
    return `Del ${diaD} al ${diaH} de ${MESES_LARGOS[mesH - 1]}${sufijoAnio}`
  }
  if (anioD === anioH) {
    const sufijoAnio = anioH !== anioRef ? ` de ${anioH}` : ''
    return `Del ${diaD} de ${MESES_LARGOS[mesD - 1]} al ${diaH} de ${MESES_LARGOS[mesH - 1]}${sufijoAnio}`
  }
  return `Del ${diaD} de ${MESES_LARGOS[mesD - 1]} de ${anioD} al ${diaH} de ${MESES_LARGOS[mesH - 1]} de ${anioH}`
}

/** Fecha completa en español sobre `AAAA-MM-DD` sin desfases horarios (`Domingo 8 de noviembre de 2026`). */
export function formatearDiaLargo(dia: string): string {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number)
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, diaDelMes))
  return `${DIAS_LARGOS[fechaUtc.getUTCDay()]} ${diaDelMes} de ${MESES_LARGOS[mes - 1]} de ${anio}`
}

/** Rótulo breve para ejes de gráficas (`Dom 2`, `14 oct` o `Hoy`), sin desfases de zona horaria. */
export function etiquetaCortaDeDia(dia: string, opciones?: { hoy?: string; conMes?: boolean }): string {
  if (opciones?.hoy && dia === opciones.hoy) return 'Hoy'
  const [anio, mes, diaDelMes] = dia.split('-').map(Number)
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, diaDelMes))
  if (opciones?.conMes) return `${diaDelMes} ${MESES_CORTOS[mes - 1]}`
  return `${DIAS_CORTOS[fechaUtc.getUTCDay()]} ${diaDelMes}`
}

/** Un día `AAAA-MM-DD` legible, sin desfases de zona horaria: `2026-11-01` → `1 nov 2026`. */
export function formatearDia(dia: string): string {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number)
  return new Date(anio, mes - 1, diaDelMes).toLocaleDateString('es-CO', { dateStyle: 'medium' })
}
