import { useQuery } from '@tanstack/react-query'
import { consultarSalud } from '../api/auth'

const CADA_30_SEGUNDOS = 30_000

/** Estado del backend (`GET /health`). Se repite cada cierto tiempo para reflejar si se perdió la conexión. */
export function useSalud() {
  return useQuery({
    queryKey: ['salud'],
    queryFn: ({ signal }) => consultarSalud(signal),
    refetchInterval: CADA_30_SEGUNDOS,
  })
}
