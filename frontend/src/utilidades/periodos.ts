import { moverDia } from './fechas'

/** Períodos de los filtros de fecha: los botones Hoy, 7 días, Este mes, Todas las fechas y Fechas. */
export type Periodo = 'hoy' | '7dias' | 'mes' | 'todas' | 'fechas'

export const PERIODOS: readonly { valor: Periodo; texto: string }[] = [
  { valor: 'hoy', texto: 'Hoy' },
  { valor: '7dias', texto: '7 días' },
  { valor: 'mes', texto: 'Este mes' },
  { valor: 'todas', texto: 'Todas las fechas' },
  { valor: 'fechas', texto: 'Fechas' },
]

const VALIDOS = new Set<string>(PERIODOS.map((p) => p.valor))

/**
 * El período guardado en la URL (`periodo=`). Sin él se abre en `porDefecto` (Hoy si no se indica), salvo una URL vieja que ya traía `date_from` o
 * `date_to`: esa se entiende como Fechas para no perder lo que pedía.
 */
export function leerPeriodo(params: URLSearchParams, porDefecto: Periodo = 'hoy'): Periodo {
  const valor = params.get('periodo')
  if (valor && VALIDOS.has(valor)) return valor as Periodo
  if (!valor && (params.get('date_from') || params.get('date_to'))) return 'fechas'
  return porDefecto
}

/** Las fechas (`date_from`, `date_to`) de un período, contadas desde `hoy` (`AAAA-MM-DD` de Colombia). */
export function rangoDePeriodo(
  periodo: Periodo,
  hoy: string,
  elegidas: { desde?: string; hasta?: string } = {},
): { date_from?: string; date_to?: string } {
  switch (periodo) {
    case 'hoy':
      return { date_from: hoy, date_to: hoy }
    case '7dias':
      return { date_from: moverDia(hoy, -6), date_to: hoy }
    case 'mes':
      return { date_from: `${hoy.slice(0, 8)}01`, date_to: hoy }
    case 'todas':
      return {}
    case 'fechas':
      return {
        ...(elegidas.desde ? { date_from: elegidas.desde } : {}),
        ...(elegidas.hasta ? { date_to: elegidas.hasta } : {}),
      }
  }
}
