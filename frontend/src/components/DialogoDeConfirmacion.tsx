import { TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDevolverFoco, useFocoAtrapado, useFondoInerte } from './useFocoAtrapado'

interface Props {
  titulo: string
  /** Qué va a pasar, en una o dos frases. */
  children?: ReactNode
  /** Texto del botón que confirma: «Sí, eliminar», «Anular venta». */
  accion: string
  /** Texto del botón que no hace nada; «Cancelar» si no se indica. */
  cancelar?: string
  /** Otro botón entre los dos, para una salida distinta (por ejemplo, desactivar en lugar de eliminar). */
  otrasAcciones?: ReactNode
  /** Acción que borra o anula algo: el botón va en rojo. */
  peligro?: boolean
  /** Mientras se hace la acción: los botones quedan desactivados. */
  ocupado?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

// Pregunta de sí o no antes de algo que no se puede deshacer. Ventana pequeña centrada; el foco empieza en
// Cancelar (o en el campo que pida) para que un Enter distraído no borre nada.
export function DialogoDeConfirmacion({ titulo, children, accion, cancelar: textoCancelar = 'Cancelar', otrasAcciones, peligro = false, ocupado = false, onConfirmar, onCancelar }: Props) {
  const ventana = useRef<HTMLDivElement>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  const idTitulo = useId()
  const idTexto = useId()
  useFondoInerte()
  useDevolverFoco()
  useFocoAtrapado(ventana, true)

  // Si la pregunta pide un dato (un motivo), el foco va a ese campo; si no, a Cancelar.
  useEffect(() => {
    const campo = ventana.current?.querySelector<HTMLElement>('input, textarea, select')
    ;(campo ?? cancelar.current)?.focus()
  }, [])

  return createPortal(
    <div className="dialogo__velo">
      <div
        ref={ventana}
        className="dialogo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={children ? idTexto : undefined}
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape') return
          // La pregunta se cierra sola: no debe cerrar también el panel que la abrió.
          evento.preventDefault()
          evento.stopPropagation()
          if (!ocupado) onCancelar()
        }}
      >
        <div className="dialogo__cabecera">
          {peligro && <TriangleAlert className="dialogo__icono" aria-hidden="true" size={18} />}
          <h2 id={idTitulo} className="dialogo__titulo">
            {titulo}
          </h2>
        </div>
        {children && (
          <div id={idTexto} className="dialogo__texto">
            {children}
          </div>
        )}
        <div className="dialogo__acciones">
          <button ref={cancelar} type="button" className="boton boton--secundario boton--auto" onClick={onCancelar} disabled={ocupado}>
            {textoCancelar}
          </button>
          {otrasAcciones}
          <button
            type="button"
            className={`boton boton--auto${peligro ? ' boton--peligro' : ''}`}
            onClick={onConfirmar}
            disabled={ocupado}
          >
            {accion}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
