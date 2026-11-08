import { useQuery, type QueryKey } from '@tanstack/react-query'

/**
 * Cuántos registros hay con unos filtros, para un indicador: se pide una página de un solo registro y se usa el
 * `count` exacto que da la API, nunca la suma de una página.
 */
export function useConteo(queryKey: QueryKey, consulta: (signal: AbortSignal) => Promise<{ count: number }>) {
  return useQuery({ queryKey, queryFn: async ({ signal }) => (await consulta(signal)).count })
}
