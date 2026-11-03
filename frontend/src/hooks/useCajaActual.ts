import { useQuery } from '@tanstack/react-query'
import { consultarCajaActual } from '../api/caja'
import { claves } from '../api/consultas'

/** Si la caja está abierta. El vendedor solo recibe `is_open`; el dueño, también la sesión. */
export function useCajaActual() {
  return useQuery({
    queryKey: claves.cajaActual,
    queryFn: ({ signal }) => consultarCajaActual(signal),
  })
}
