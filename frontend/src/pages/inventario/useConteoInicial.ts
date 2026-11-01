import { useQuery } from '@tanstack/react-query'
import { claves } from '../../api/consultas'
import { consultarConteoInicial } from '../../api/inventario'

/** Estado del inventario inicial. Lo consultan todos los roles; `habilitado` evita pedirlo cuando no hace falta. */
export function useConteoInicial(habilitado = true) {
  return useQuery({
    queryKey: claves.conteoInicial,
    queryFn: ({ signal }) => consultarConteoInicial(signal),
    enabled: habilitado,
  })
}
