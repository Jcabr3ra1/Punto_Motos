import { useQuery } from '@tanstack/react-query'
import { claves } from '../api/consultas'
import { obtenerNegocio } from '../api/negocio'

/** Datos del negocio. Comparten la caché con la pantalla de Configuración: si el dueño los guarda, todo se actualiza. */
export function useNegocio() {
  return useQuery({
    queryKey: claves.negocio,
    queryFn: ({ signal }) => obtenerNegocio(signal),
  })
}
