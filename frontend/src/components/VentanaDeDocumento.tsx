import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDevolverFoco, useFocoAtrapado, useFondoInerte } from './useFocoAtrapado'

interface Props {
  titulo: string
  onCerrar: () => void
  /** Botones propios del documento (Devolver, Anular…): van a la izquierda del pie; «Cerrar», a la derecha. */
  acciones?: ReactNode
  children: ReactNode
}

/**
 * Un documento (hoja de liquidación, recibo, comprobante) en una ventana emergente sobre la pantalla, sin salir de
 * ella. «Cerrar», la X o Esc la cierran y el foco vuelve a quien la abrió.
 */
export function VentanaDeDocumento({ titulo, onCerrar, acciones, children }: Props) {
  const ventana = useRef<HTMLDivElement>(null)
  const cerrar = useRef<HTMLButtonElement>(null)
  const idTitulo = useId()
  useFondoInerte()
  useDevolverFoco()
  useFocoAtrapado(ventana, true)

  useEffect(() => {
    cerrar.current?.focus()
  }, [])

  return createPortal(
    <div className="dialogo__velo">
      <div
        ref={ventana}
        className="dialogo ventana-de-documento"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape') return
          evento.preventDefault()
          evento.stopPropagation()
          onCerrar()
        }}
      >
        <div className="dialogo__cabecera ventana-de-documento__cabecera">
          <h2 id={idTitulo} className="dialogo__titulo">
            {titulo}
          </h2>
          <button type="button" className="ventana-de-documento__x" aria-label="Cerrar la ventana" title="Cerrar (Esc)" onClick={onCerrar}>
            <X aria-hidden="true" size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="ventana-de-documento__cuerpo">{children}</div>
        <div className="dialogo__acciones ventana-de-documento__pie">
          {acciones && <div className="ventana-de-documento__acciones">{acciones}</div>}
          <button ref={cerrar} type="button" className="boton boton--auto" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
