import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import type { Role } from '../api/types'
import { DESTINOS, MENU_PRINCIPAL, pantallasVisibles, type Destino } from '../navegacion/destinos'
import { moduloDe } from '../navegacion/ubicacion'

interface Props {
  rol: Role
  conteoAbierto: boolean
  recogido: boolean
  onAlternar: () => void
}

/**
 * Menú lateral del marco «Tablero»: cada sección con sus pantallas colgando debajo. Solo está desplegada la sección
 * de la pantalla actual; al pulsar otra se va a su primera pantalla, así que nunca hay dos abiertas. Configuración va
 * al pie, separada del trabajo diario.
 */
export function MenuLateral({ rol, conteoAbierto, recogido, onAlternar }: Props) {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const actual = moduloDe(pathname)

  const entrada = (modulo: Destino) => {
    const Icono = modulo.icono
    if (modulo === DESTINOS.inicio) {
      return (
        <li key={modulo.ruta}>
          <NavLink to={modulo.ruta} end className="menu-lateral__seccion" title={recogido ? modulo.etiqueta : undefined}>
            <Icono className="menu-lateral__icono" aria-hidden="true" size={18} strokeWidth={1.75} />
            <span className="menu-lateral__nombre">{modulo.etiqueta}</span>
          </NavLink>
        </li>
      )
    }

    const pantallas = pantallasVisibles(modulo, rol, conteoAbierto)
    if (pantallas.length === 0) return null
    const abierta = modulo.ruta === actual.ruta
    const Flecha = abierta ? ChevronDown : ChevronRight
    return (
      <li key={modulo.ruta} className={`menu-lateral__grupo${abierta ? ' menu-lateral__grupo--abierto' : ''}`}>
        <button
          type="button"
          className="menu-lateral__seccion"
          aria-expanded={abierta}
          title={recogido ? modulo.etiqueta : undefined}
          onClick={() => {
            if (!abierta) navegar(pantallas[0].ruta)
          }}
        >
          <Icono className="menu-lateral__icono" aria-hidden="true" size={18} strokeWidth={1.75} />
          <span className="menu-lateral__nombre">{modulo.etiqueta}</span>
          <Flecha className="menu-lateral__flecha" aria-hidden="true" size={14} strokeWidth={2} />
        </button>
        {abierta && !recogido && (
          <ul role="group" aria-label={modulo.etiqueta} className="menu-lateral__pantallas">
            {pantallas.map((pantalla) => (
              <li key={pantalla.ruta}>
                <NavLink to={pantalla.ruta} className="menu-lateral__pantalla">
                  {pantalla.etiqueta}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  const principales = MENU_PRINCIPAL.filter((modulo) => modulo !== DESTINOS.configuracion)
  const IconoAlternar = recogido ? PanelLeftOpen : PanelLeftClose

  return (
    <aside className={`menu-lateral${recogido ? ' menu-lateral--recogido' : ''}`}>
      <div className="menu-lateral__marca">
        <img className="menu-lateral__logo" src="/logo.png" alt="" width={480} height={469} />
        <p className="menu-lateral__titulo">
          Punto Moto
          <span className="menu-lateral__subtitulo">Tienda y taller</span>
        </p>
      </div>
      <nav aria-label="Principal" className="menu-lateral__nav">
        <ul className="menu-lateral__lista menu-lateral__lista--principal">{principales.map(entrada)}</ul>
        <ul className="menu-lateral__lista menu-lateral__pie">{entrada(DESTINOS.configuracion)}</ul>
      </nav>
      <button
        type="button"
        className="menu-lateral__alternar"
        onClick={onAlternar}
        aria-label={recogido ? 'Expandir el menú' : 'Recoger el menú'}
        aria-keyshortcuts="Control+B"
        title={recogido ? 'Expandir el menú (Ctrl+B)' : 'Recoger el menú (Ctrl+B)'}
      >
        <IconoAlternar aria-hidden="true" size={16} strokeWidth={1.75} />
        <span className="menu-lateral__nombre">Recoger</span>
      </button>
    </aside>
  )
}
