/** Fecha y hora legibles en español, o `Nunca` si no hay valor. Recibe ISO 8601. */
export function formatearFechaHora(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Fecha de hoy en Colombia como `AAAA-MM-DD`, para los campos de fecha y los filtros. */
export function hoyEnColombia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

/** Un día `AAAA-MM-DD` legible, sin desfases de zona horaria: `2026-11-01` → `1 nov 2026`. */
export function formatearDia(dia: string): string {
  const [anio, mes, diaDelMes] = dia.split('-').map(Number)
  return new Date(anio, mes - 1, diaDelMes).toLocaleDateString('es-CO', { dateStyle: 'medium' })
}
