import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const CLAVE = 'puntomoto.menuRecogido'
// En una ventana angosta el panel contextual se recoge solo, sin cambiar la preferencia guardada.
const VENTANA_ANGOSTA = '(max-width: 1000px)'

function leerPreferencia(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

function ventanaAngosta(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(VENTANA_ANGOSTA).matches
}

/**
 * Si el panel contextual del menú está recogido. Ctrl+B y el botón de la columna lo alternan; la preferencia se
 * recuerda entre aperturas. Si la ventana es angosta, empieza recogido.
 */
export function useEstadoDelMenu(): { recogido: boolean; alternar: () => void } {
  const [preferencia, setPreferencia] = useState(leerPreferencia)
  const [angosta, setAngosta] = useState(ventanaAngosta)
  // En ventana angosta, abrir el panel es una decisión de este momento, no una preferencia guardada.
  const [abiertoEnAngosta, setAbiertoEnAngosta] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(VENTANA_ANGOSTA)
    const alCambiar = () => {
      setAngosta(consulta.matches)
      setAbiertoEnAngosta(false)
    }
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])

  const recogido = angosta ? !abiertoEnAngosta : preferencia

  const alternar = useCallback(() => {
    if (angosta) {
      setAbiertoEnAngosta((abierto) => !abierto)
      return
    }
    setPreferencia((actual) => {
      const nuevo = !actual
      try {
        localStorage.setItem(CLAVE, nuevo ? '1' : '0')
      } catch {
        // Sin almacenamiento, la preferencia dura hasta cerrar el programa.
      }
      return nuevo
    })
  }, [angosta])

  return { recogido, alternar }
}

/** Para que las secciones muestren sus pestañas cuando el panel contextual está recogido. */
export const ContextoMenuRecogido = createContext(false)

export function useMenuRecogido(): boolean {
  return useContext(ContextoMenuRecogido)
}
