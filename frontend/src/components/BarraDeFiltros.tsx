import { Search } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { hayVentanaAbierta } from './useFocoAtrapado'

interface Busqueda {
  valor: string
  onCambiar: (valor: string) => void
  placeholder: string
  /** Nombre accesible del campo: «Buscar productos». */
  etiqueta: string
}

const formatoDeCantidad = new Intl.NumberFormat('es-CO')

/** Es un campo donde se está escribiendo: ahí la tecla / es solo una barra. */
const escribiendo = (elemento: Element | null) =>
  elemento instanceof HTMLElement && (elemento.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(elemento.tagName))

/** Barra de filtros: búsqueda a la izquierda (tecla /), filtros como botones y cuántos resultados hay. */
export function BarraDeFiltros({ busqueda, resultados, children }: { busqueda?: Busqueda; resultados?: number; children?: ReactNode }) {
  const campo = useRef<HTMLInputElement>(null)
  const idAtajo = useId()

  useEffect(() => {
    if (!busqueda) return
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey) return
      if (escribiendo(document.activeElement) || hayVentanaAbierta()) return
      evento.preventDefault()
      campo.current?.focus()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [busqueda])

  return (
    <div className="barra-de-filtros" role="search">
      {busqueda && (
        <label className="barra-de-filtros__busqueda">
          <Search aria-hidden="true" size={16} strokeWidth={1.75} />
          <input
            ref={campo}
            type="search"
            aria-label={busqueda.etiqueta}
            aria-describedby={idAtajo}
            value={busqueda.valor}
            onChange={(evento) => busqueda.onCambiar(evento.target.value)}
            placeholder={busqueda.placeholder}
            autoComplete="off"
          />
          <kbd id={idAtajo} className="barra-de-filtros__tecla" aria-label="Atajo: barra">
            /
          </kbd>
        </label>
      )}
      {children}
      {resultados !== undefined && (
        <p className="barra-de-filtros__resultados" aria-live="polite">
          {formatoDeCantidad.format(resultados)} {resultados === 1 ? 'resultado' : 'resultados'}
        </p>
      )}
    </div>
  )
}

/** Filtro que se activa y desactiva; activo va en negro con el punto lima. */
export function BotonDeFiltro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="filtro" aria-pressed={activo} onClick={onClick}>
      {children}
    </button>
  )
}

/** Lista desplegable con forma de botón de filtro: «Tipo: Todos ▾». El rótulo visible es solo visual. */
export function ListaDeFiltro({ etiqueta, valor, onCambiar, children }: { etiqueta: string; valor: string; onCambiar: (valor: string) => void; children: ReactNode }) {
  return (
    <label className="filtro filtro--lista">
      <span aria-hidden="true">{etiqueta}:</span>
      <select aria-label={etiqueta} value={valor} onChange={(evento) => onCambiar(evento.target.value)}>
        {children}
      </select>
    </label>
  )
}
