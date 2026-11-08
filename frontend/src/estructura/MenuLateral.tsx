import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef, useState, type FocusEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import type { Role } from '../api/types'
import { DESTINOS, MENU_PRINCIPAL, pantallasVisibles, type Destino } from '../navegacion/destinos'
import { moduloDe } from '../navegacion/ubicacion'

/** Milisegundos que espera la ventanita antes de cerrarse cuando el ratón sale. */
const PAUSA_AL_SALIR = 150
/** Medidas de la ventanita en píxeles (las mismas del CSS), para que no se salga por abajo. */
const ALTO_TITULO = 36
const ALTO_PANTALLA = 28
const MARGEN = 8

interface Props {
  rol: Role
  conteoAbierto: boolean
  recogido: boolean
  onAlternar: () => void
}

/**
 * Menú lateral del marco «Tablero»: cada sección con sus pantallas colgando debajo. Solo está desplegada la sección
 * de la pantalla actual; al pulsar otra se va a su primera pantalla, así que nunca hay dos abiertas. Configuración va
 * al pie, separada del trabajo diario. Recogido, solo quedan los iconos: al pasar el ratón o llevar el foco a una
 * sección, sus pantallas salen en una ventanita a la derecha.
 */
export function MenuLateral({ rol, conteoAbierto, recogido, onAlternar }: Props) {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const actual = moduloDe(pathname)
  // Recogido: la sección cuya ventanita está abierta y a qué altura de la ventana sale.
  const [estadoFlotante, setFlotante] = useState<{ ruta: string; arriba: number; en: string } | null>(null)
  // Al cambiar de pantalla o expandir el menú, la ventanita que estaba abierta deja de valer.
  const flotante = recogido && estadoFlotante?.en === pathname ? estadoFlotante : null

  const mostrar = (ruta: string, elemento: HTMLElement, cuantas: number) => {
    if (!recogido || flotante?.ruta === ruta) return
    // Sale a la altura de la sección, pero sin pasarse del borde de abajo (Configuración está al pie).
    const alto = ALTO_TITULO + cuantas * ALTO_PANTALLA
    const arriba = Math.max(0, Math.min(elemento.getBoundingClientRect().top, window.innerHeight - alto - MARGEN))
    setFlotante({ ruta, arriba, en: pathname })
  }
  // Al salir con el ratón se espera un instante: así, al ir en diagonal hacia la ventanita, no se cierra en el camino.
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelarCierre = () => clearTimeout(temporizador.current)
  const cerrarConPausa = () => {
    cancelarCierre()
    temporizador.current = setTimeout(() => setFlotante(null), PAUSA_AL_SALIR)
  }
  useEffect(() => cancelarCierre, [])

  // El foco salió del grupo (botón y ventanita): se cierra.
  const alSalirElFoco = (evento: FocusEvent<HTMLLIElement>) => {
    if (!evento.currentTarget.contains(evento.relatedTarget)) setFlotante(null)
  }

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
      <li
        key={modulo.ruta}
        className={`menu-lateral__grupo${abierta ? ' menu-lateral__grupo--abierto' : ''}`}
        onMouseEnter={(evento) => {
          cancelarCierre()
          mostrar(modulo.ruta, evento.currentTarget, pantallas.length)
        }}
        onMouseLeave={cerrarConPausa}
        onFocus={(evento) => mostrar(modulo.ruta, evento.currentTarget, pantallas.length)}
        onBlur={alSalirElFoco}
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape' || flotante?.ruta !== modulo.ruta) return
          evento.stopPropagation()
          setFlotante(null)
          evento.currentTarget.querySelector<HTMLButtonElement>('.menu-lateral__seccion')?.focus()
        }}
      >
        <button
          type="button"
          className="menu-lateral__seccion"
          aria-expanded={abierta}
          aria-label={recogido ? modulo.etiqueta : undefined}
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
        {recogido && flotante?.ruta === modulo.ruta && (
          <div className="menu-lateral__flotante" style={{ top: flotante.arriba }}>
            <p className="menu-lateral__flotante-titulo" aria-hidden="true">
              {modulo.etiqueta}
            </p>
            <ul role="group" aria-label={modulo.etiqueta} className="menu-lateral__flotante-lista">
              {pantallas.map((pantalla) => (
                <li key={pantalla.ruta}>
                  <NavLink to={pantalla.ruta} className="menu-lateral__pantalla" onClick={() => setFlotante(null)}>
                    {pantalla.etiqueta}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
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
