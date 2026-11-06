import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DialogoDeConfirmacion } from './DialogoDeConfirmacion'
import { enfocablesDe, useDevolverFoco, useFocoAtrapado, useFondoInerte } from './useFocoAtrapado'

interface Props {
  titulo: string
  /** Módulo desde donde se abrió, en la cabecera: «Productos», «Caja». */
  modulo: string
  descripcion?: string
  /** «ancho» para formularios con varias líneas, como una devolución. */
  ancho?: 'normal' | 'ancho'
  onCerrar: () => void
  children: ReactNode
}

// Panel que entra por la derecha con un formulario, sin perder de vista la pantalla de atrás. Esc cierra (y pregunta
// si hay cambios sin guardar), Ctrl+Enter guarda y el foco no sale del panel mientras está abierto.
export function PanelLateral({ titulo, modulo, descripcion, ancho = 'normal', onCerrar, children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const cuerpo = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const [conCambios, setConCambios] = useState(false)
  const [preguntando, setPreguntando] = useState(false)
  useFondoInerte()
  useDevolverFoco()
  useFocoAtrapado(panel, !preguntando)

  // Al abrir, el foco va al primer campo del formulario (o al primer control si no hay campos).
  useEffect(() => {
    const contenedor = cuerpo.current
    if (!contenedor) return
    const controles = enfocablesDe(contenedor)
    const campo = controles.find((control) => control.matches('input, select, textarea')) ?? controles[0]
    ;(campo ?? panel.current)?.focus()
  }, [])

  function intentarCerrar() {
    if (conCambios) setPreguntando(true)
    else onCerrar()
  }

  function alPulsar(evento: KeyboardEvent) {
    if (preguntando) return
    if (evento.key === 'Escape') {
      evento.preventDefault()
      intentarCerrar()
    } else if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
      evento.preventDefault()
      cuerpo.current?.querySelector('form')?.requestSubmit()
    }
  }

  return createPortal(
    <div className="panel-lateral__velo" onMouseDown={(evento) => evento.target === evento.currentTarget && intentarCerrar()}>
      <div
        ref={panel}
        className={`panel-lateral panel-lateral--${ancho}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onKeyDown={alPulsar}
      >
        <header className="panel-lateral__cabecera">
          <div>
            <p className="panel-lateral__modulo">{modulo}</p>
            <h2 id={idTitulo} className="panel-lateral__titulo">
              {titulo}
            </h2>
            {descripcion && <p className="panel-lateral__descripcion">{descripcion}</p>}
          </div>
          <button type="button" className="panel-lateral__cerrar" onClick={intentarCerrar} aria-label="Cerrar" title="Cerrar (Esc)">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div
          ref={cuerpo}
          className="panel-lateral__cuerpo"
          // Cualquier cambio en un campo cuenta como trabajo sin guardar.
          onInput={() => setConCambios(true)}
          onChange={() => setConCambios(true)}
        >
          {children}
        </div>
        <p className="panel-lateral__ayuda" aria-hidden="true">
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
          <span>
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd> guardar
          </span>
        </p>
      </div>
      {preguntando && (
        <DialogoDeConfirmacion
          titulo="¿Descartar los cambios?"
          accion="Descartar"
          cancelar="Seguir editando"
          peligro
          onConfirmar={onCerrar}
          onCancelar={() => setPreguntando(false)}
        >
          Lo que escribiste en «{titulo}» no se ha guardado.
        </DialogoDeConfirmacion>
      )}
    </div>,
    document.body,
  )
}
