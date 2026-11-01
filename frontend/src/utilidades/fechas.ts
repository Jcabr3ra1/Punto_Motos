/** Fecha y hora legibles en español, o `Nunca` si no hay valor. Recibe ISO 8601. */
export function formatearFechaHora(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}
