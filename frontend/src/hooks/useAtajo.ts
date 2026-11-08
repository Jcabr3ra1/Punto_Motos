import { useEffect, useRef } from 'react'
import { hayVentanaAbierta } from '../components/useFocoAtrapado'

/**
 * Atajo Ctrl (o Cmd) + tecla para la acción principal de la pantalla, por ejemplo Ctrl+N «Nuevo». No actúa con una
 * ventana abierta encima (panel, confirmación, buscador) ni si la tecla se mantiene pulsada.
 */
export function useAtajo(tecla: string, alPulsar: () => void, activo = true) {
  const accion = useRef(alPulsar)
  useEffect(() => {
    accion.current = alPulsar
  })

  useEffect(() => {
    if (!activo) return
    const alTeclear = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey) || evento.altKey || evento.key.toLowerCase() !== tecla) return
      // Se evita también la acción del navegador (Ctrl+N abre otra ventana en WebView2).
      evento.preventDefault()
      if (evento.repeat || hayVentanaAbierta()) return
      accion.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [tecla, activo])
}
