import { useQuery } from '@tanstack/react-query'
import { claves } from '../api/consultas'
import { listarProductos } from '../api/productos'
import type { Product } from '../api/types'

const POR_PAGINA = 200
/** El catálogo cambia con cada venta o compra: se vuelve a mirar cada 5 minutos. */
const CADA_CINCO_MINUTOS = 5 * 60_000

/** Qué tan cerca está de acabarse: 0 es agotado; 1, justo en su mínimo. */
const urgencia = (producto: Product) => producto.stock / Math.max(producto.min_stock, 1)

/**
 * Productos activos que están en su mínimo o por debajo (`is_low_stock`), del más urgente al menos urgente.
 * La API no tiene un filtro para pedir solo esos, así que recorre todo el catálogo en páginas de 200; si Alex agrega
 * el filtro, esta consulta pasa a ser una sola.
 */
export function useProductosPorReponer() {
  return useQuery({
    queryKey: [...claves.productos, 'por-reponer'],
    staleTime: CADA_CINCO_MINUTOS,
    refetchInterval: CADA_CINCO_MINUTOS,
    queryFn: async ({ signal }): Promise<Product[]> => {
      const porReponer: Product[] = []
      for (let pagina = 1; ; pagina++) {
        const respuesta = await listarProductos({ page: pagina, page_size: POR_PAGINA }, signal)
        porReponer.push(...respuesta.results.filter((producto) => producto.is_low_stock))
        if (!respuesta.next || respuesta.results.length === 0) break
      }
      return porReponer.sort((a, b) => urgencia(a) - urgencia(b) || a.name.localeCompare(b.name, 'es'))
    },
  })
}
