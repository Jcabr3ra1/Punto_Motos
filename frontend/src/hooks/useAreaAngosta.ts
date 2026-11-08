import { useEffect, useState } from 'react'

/** Ancho del área de trabajo por debajo del cual la ficha deja de ir al lado y se abre como panel lateral. */
export const ANCHO_ANGOSTO = 1100

/**
 * Si el área de trabajo (#contenido) mide menos de 1100px. Depende del menú recogido o no, por eso se mide el área y
 * no la ventana. Sin ResizeObserver (pruebas), se considera ancha.
 */
export function useAreaAngosta(): boolean {
  const [angosta, setAngosta] = useState(false)
  useEffect(() => {
    const area = document.getElementById('contenido')
    if (!area || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([entrada]) => setAngosta(entrada.contentRect.width < ANCHO_ANGOSTO))
    observador.observe(area)
    return () => observador.disconnect()
  }, [])
  return angosta
}
