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
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

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
