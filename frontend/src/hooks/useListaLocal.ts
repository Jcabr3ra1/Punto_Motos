import { useRef, useState } from 'react'
import { sinTildes } from '../utilidades/texto'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from './useFilasQueCaben'

export type FiltroDeActivos = 'todos' | 'activos' | 'inactivos'

/**
 * Una lista que la API entrega completa (catálogo, mecánicos, tipos de servicio): la búsqueda sin tildes, el filtro
 * de activos e inactivos y las páginas de las filas que caben se hacen aquí. Cambiar un filtro vuelve a la primera.
 */
export function useListaLocal<T extends { is_active: boolean }>(elementos: readonly T[], textosDe: (elemento: T) => string[]) {
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<FiltroDeActivos>('todos')
  const [pagina, setPagina] = useState(1)

  const texto = sinTildes(busqueda.trim())
  const visibles = elementos.filter(
    (e) =>
      (estado === 'todos' || e.is_active === (estado === 'activos')) &&
      (!texto || textosDe(e).some((t) => sinTildes(t).includes(texto))),
  )
  const paginas = Math.max(1, Math.ceil(visibles.length / porPagina))
  const actual = Math.min(pagina, paginas)

  return {
    lista,
    porPagina,
    busqueda,
    buscar: (valor: string) => {
      setBusqueda(valor)
      setPagina(1)
    },
    estado,
    filtrarEstado: (valor: FiltroDeActivos) => {
      setEstado(valor)
      setPagina(1)
    },
    visibles,
    enPagina: visibles.slice((actual - 1) * porPagina, actual * porPagina),
    pagina: actual,
    paginas,
    setPagina,
  }
}
