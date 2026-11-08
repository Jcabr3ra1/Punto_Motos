import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAreaAngosta } from '../hooks/useAreaAngosta'
import { PanelLateral } from './PanelLateral'

interface Props {
  titulo: string
  /** Pantalla desde donde se abre, para la cabecera del panel en ventanas angostas: «Productos». */
  modulo: string
  onCerrar: () => void
  /** Botones del pie: Editar, Ajustar… */
  acciones?: ReactNode
  children: ReactNode
}

/**
 * Detalle del elemento elegido en una lista, sin salir de ella: al lado de la tabla cuando hay espacio y, en un área
 * angosta, como el panel lateral de los formularios. Esc la cierra.
 */
export function Ficha({ titulo, modulo, onCerrar, acciones, children }: Props) {
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
      className="ficha"
      aria-label={titulo}
      onKeyDown={(evento) => {
        if (evento.key !== 'Escape') return
        evento.stopPropagation()
        onCerrar()
      }}
    >
      <div className="ficha__cabecera">
        <h3 className="ficha__titulo">{titulo}</h3>
        <button type="button" className="ficha__cerrar" aria-label="Cerrar la ficha" title="Cerrar (Esc)" onClick={onCerrar}>
          <X aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      </div>
      {/* Las acciones van arriba, bajo el título: siempre a la vista aunque la ficha sea larga. */}
      {acciones && <div className="ficha__acciones">{acciones}</div>}
      <div className="ficha__cuerpo">{children}</div>
    </aside>
  )
}
