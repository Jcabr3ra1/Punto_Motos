import { useState, type KeyboardEvent } from 'react'

/**
 * La fila elegida de una lista con ficha. Se guarda solo su id: si la fila deja de estar en la lista (al filtrar o
 * cambiar de página) la ficha se cierra, y si vuelve con datos nuevos se muestran los nuevos. Las flechas mueven la
 * selección sobre la tabla.
 */
export function useSeleccion<T>(elementos: readonly T[] | undefined, idDe: (elemento: T) => number) {
  const [id, setId] = useState<number | null>(null)
  const lista = elementos ?? []
  const posicion = id === null ? -1 : lista.findIndex((elemento) => idDe(elemento) === id)
  const elegido = posicion === -1 ? null : lista[posicion]

  const elegir = (elemento: T) => setId(idDe(elemento))
  const cerrar = () => setId(null)

  const alTeclear = (evento: KeyboardEvent) => {
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return
    if (lista.length === 0) return
    evento.preventDefault()
    const paso = evento.key === 'ArrowDown' ? 1 : -1
    const siguiente = posicion === -1 ? 0 : Math.min(lista.length - 1, Math.max(0, posicion + paso))
    setId(idDe(lista[siguiente]))
  }

  return { elegido, elegir, cerrar, alTeclear }
}
