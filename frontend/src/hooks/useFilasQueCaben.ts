import { useEffect, useState, type RefObject } from 'react'

/**
 * Medidas del libro: filas de 48px, más la cabecera de la tabla (36px), el pie con Atrás y Siguiente (48px) y los
 * bordes. Sin poder medir, 20 por página. Si cambian, hay que cambiar también las alturas en index.css.
 */
export const MEDIDAS_DEL_LIBRO = { fila: 48, fijo: 36 + 48 + 2, porDefecto: 20 }

interface Medidas {
  /** Alto fijo de cada fila de la tabla. */
  fila: number
  /** Lo que ocupa el contenedor además de las filas: cabecera de la tabla, pie con la paginación y bordes. */
  fijo: number
  /** Filas por página mientras no se puede medir (pruebas, primer pintado). */
  porDefecto: number
  minimo?: number
  maximo?: number
}

/**
 * Cuántas filas enteras caben en el contenedor de un libro, para pedir a la API justo esa página: así la última fila
 * llega al pie sin quedar cortada. Se vuelve a medir al cambiar el tamaño de la ventana o del menú.
 */
export function useFilasQueCaben(contenedor: RefObject<HTMLElement | null>, { fila, fijo, porDefecto, minimo = 5, maximo = 50 }: Medidas): number {
  const [filas, setFilas] = useState(porDefecto)
  useEffect(() => {
    const elemento = contenedor.current
    if (!elemento || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) => {
      const alto = entrada.borderBoxSize?.[0]?.blockSize ?? entrada.contentRect.height
      if (alto <= 0) return
      const caben = Math.floor((alto - fijo) / fila)
      setFilas(Math.min(maximo, Math.max(minimo, caben)))
    })
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [contenedor, fila, fijo, minimo, maximo])
  return filas
}
