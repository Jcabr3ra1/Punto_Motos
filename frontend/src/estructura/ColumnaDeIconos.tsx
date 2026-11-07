import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Link } from 'react-router'
import type { Destino } from '../navegacion/destinos'

interface Props {
  modulos: readonly Destino[]
  /** Configuración va abajo, separada de los módulos del día a día. */
  ajustes?: Destino
  moduloActual: Destino
  recogido: boolean
  onAlternar: () => void
}

// Columna fija de iconos con los módulos, como el riel de un programa de escritorio. Siempre visible.
export function ColumnaDeIconos({ modulos, ajustes, moduloActual, recogido, onAlternar }: Props) {
  const enlace = (modulo: Destino) => {
    const Icono = modulo.icono
    const actual = modulo.ruta === moduloActual.ruta
    return (
      <li key={modulo.ruta}>
        <Link
          to={modulo.ruta}
          className="columna__modulo"
          aria-current={actual ? 'page' : undefined}
          title={modulo.descripcion}
        >
          <Icono aria-hidden="true" size={20} strokeWidth={1.75} />
          <span>{modulo.etiqueta}</span>
        </Link>
      </li>
    )
  }

  const IconoAlternar = recogido ? PanelLeftOpen : PanelLeftClose
  return (
    <aside className="columna">
      <img className="columna__logo" src="/logo.png" alt="Punto Moto" width={480} height={470} />
      <nav aria-label="Principal" className="columna__nav">
        <ul className="columna__lista">{modulos.map(enlace)}</ul>
        <ul className="columna__lista columna__lista--abajo">
          <li>
            <button
              type="button"
              className="columna__herramienta"
              onClick={onAlternar}
              aria-label={recogido ? 'Expandir el menú' : 'Recoger el menú'}
              aria-keyshortcuts="Control+B"
              title={recogido ? 'Expandir el menú (Ctrl+B)' : 'Recoger el menú (Ctrl+B)'}
            >
              <IconoAlternar aria-hidden="true" size={18} strokeWidth={1.75} />
            </button>
          </li>
          {ajustes && enlace(ajustes)}
        </ul>
      </nav>
    </aside>
  )
}
