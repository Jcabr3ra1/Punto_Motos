import { useCallback, useEffect, useState } from 'react'

const CLAVE = 'puntomoto.menuRecogido'
// En una ventana angosta el menú se recoge solo, sin cambiar la preferencia guardada.
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
 * Si el menú lateral está recogido. Ctrl+B y el botón del pie del menú lo alternan; la preferencia se
 * recuerda entre aperturas. Si la ventana es angosta, empieza recogido.
 */
/**
 * Con `forzarRecogido` (la pantalla de Vender) el menú se recoge solo para dar espacio, sin cambiar la preferencia
 * guardada; Ctrl+B lo puede abrir mientras se está ahí, y al salir vuelve a la preferencia.
 */
export function useEstadoDelMenu(forzarRecogido = false): { recogido: boolean; alternar: () => void } {
  const [preferencia, setPreferencia] = useState(leerPreferencia)
  const [angosta, setAngosta] = useState(ventanaAngosta)
  // En ventana angosta, abrir el menú es una decisión de este momento, no una preferencia guardada.
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

  const [abiertoAunForzado, setAbiertoAunForzado] = useState(false)
  // Al entrar o salir de la pantalla que lo recoge, se olvida si se abrió a mano mientras se estaba ahí.
  const [forzadoAntes, setForzadoAntes] = useState(forzarRecogido)
  if (forzadoAntes !== forzarRecogido) {
    setForzadoAntes(forzarRecogido)
    setAbiertoAunForzado(false)
  }

  const recogido = forzarRecogido ? !abiertoAunForzado : angosta ? !abiertoEnAngosta : preferencia

  const alternar = useCallback(() => {
    if (forzarRecogido) {
      setAbiertoAunForzado((abierto) => !abierto)
      return
    }
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
  }, [angosta, forzarRecogido])

  return { recogido, alternar }
}
