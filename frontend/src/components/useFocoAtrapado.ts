import { useEffect, type RefObject } from 'react'

const ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Los controles que reciben el foco con Tab, en orden, dentro del contenedor. */
export function enfocablesDe(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(ENFOCABLES)).filter((elemento) => !elemento.closest('[hidden]'))
}

/**
 * Mientras `activo`, Tab y Mayús+Tab recorren solo los controles del contenedor, como en una ventana modal de
 * Windows. Al desactivarse o desmontarse, el foco vuelve a quien lo tenía al activarse.
 */
export function useFocoAtrapado(ref: RefObject<HTMLElement | null>, activo: boolean): void {
  useEffect(() => {
    const contenedor = ref.current
    if (!activo || !contenedor) return

    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Tab') return
      const controles = enfocablesDe(contenedor)
      if (controles.length === 0) {
        evento.preventDefault()
        return
      }
      const primero = controles[0]
      const ultimo = controles[controles.length - 1]
      const actual = document.activeElement
      if (evento.shiftKey && (actual === primero || !contenedor.contains(actual))) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && (actual === ultimo || !contenedor.contains(actual))) {
        evento.preventDefault()
        primero.focus()
      }
    }
    contenedor.addEventListener('keydown', alPulsar)
    return () => contenedor.removeEventListener('keydown', alPulsar)
  }, [ref, activo])
}

/** Guarda quién tenía el foco al montar y se lo devuelve al desmontar. */
export function useDevolverFoco(): void {
  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      if (previo?.isConnected) previo.focus()
    }
  }, [])
}
