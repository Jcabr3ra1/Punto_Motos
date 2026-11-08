import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAreaAngosta } from '../hooks/useAreaAngosta'
import { PanelLateral } from './PanelLateral'

interface Props {
  titulo: string
  /** Pantalla desde donde se abre, para la cabecera del panel en áreas angostas: «Ventas». */
  modulo: string
  onCerrar: () => void
  /** Botones del pie: «Abrir el recibo»… La acción principal va en lima. */
  acciones?: ReactNode
  children: ReactNode
}

/**
 * El elemento elegido de un libro (una lista con su detalle), en el panel negro de la derecha, como la caja
 * registradora de Vender y el cajón de Caja. En un área angosta se abre como el panel lateral de los formularios.
 * Esc lo cierra.
 */
export function Registro({ titulo, modulo, onCerrar, acciones, children }: Props) {
  const angosta = useAreaAngosta()

  if (angosta) {
    return (
      <PanelLateral titulo={titulo} modulo={modulo} onCerrar={onCerrar}>
        <div className="ficha__cuerpo">{children}</div>
        {acciones && <div className="ficha__pie">{acciones}</div>}
      </PanelLateral>
    )
  }

  return (
    <aside
      className="registro"
      aria-label={titulo}
      onKeyDown={(evento) => {
        if (evento.key !== 'Escape') return
        evento.stopPropagation()
        onCerrar()
      }}
    >
      <div className="registro__cabecera">
        <h3 className="registro__titulo">{titulo}</h3>
        <button type="button" className="registro__cerrar" aria-label="Cerrar la ficha" title="Cerrar (Esc)" onClick={onCerrar}>
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="registro__cuerpo">{children}</div>
      {acciones && <div className="registro__pie">{acciones}</div>}
    </aside>
  )
}

/** El registro sin nada elegido: en un área ancha guarda su lugar e invita a elegir; en una angosta no se muestra. */
export function RegistroVacio({ mensaje }: { mensaje: string }) {
  const angosta = useAreaAngosta()
  if (angosta) return null
  return (
    <div className="registro registro--vacio">
      <p>{mensaje}</p>
    </div>
  )
}
