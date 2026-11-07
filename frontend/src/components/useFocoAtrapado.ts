import { useEffect, useState, type RefObject } from 'react'

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

/**
 * Guarda quién tenía el foco al abrir y se lo devuelve al cerrar. Se toma en el primer render, antes de que un
 * campo con autoFocus se quede con el foco.
 */
export function useDevolverFoco(): void {
  const [previo] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  useEffect(
    () => () => {
      if (previo?.isConnected) previo.focus()
    },
    [previo],
  )
}

/** Ventanas que ya tienen el teclado: paneles, confirmaciones y el diálogo nativo de actualizaciones. */
export const SELECTOR_DE_VENTANAS = '[role="dialog"], [role="alertdialog"], dialog[open]'

export function hayVentanaAbierta(): boolean {
  return document.querySelector(SELECTOR_DE_VENTANAS) !== null
}

// Cuántas ventanas modales hay abiertas: la pantalla de atrás sigue inerte hasta que se cierre la última.
let modalesAbiertas = 0

/**
 * Mientras la ventana está montada, la aplicación de atrás (#root) queda inerte: no recibe clics, foco ni lectura.
 * Las ventanas se montan fuera de #root, así que siguen activas.
 */
export function useFondoInerte(): void {
  useEffect(() => {
    const raiz = document.getElementById('root')
    modalesAbiertas += 1
    raiz?.setAttribute('inert', '')
    return () => {
      modalesAbiertas -= 1
      if (modalesAbiertas === 0) raiz?.removeAttribute('inert')
    }
  }, [])
}
