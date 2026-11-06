import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { useSalud } from '../hooks/useSalud'
import { DESTINOS, MENU_PRINCIPAL, pantallasDe, puedeVer, type Destino } from '../navegacion/destinos'
import { moduloDe } from '../navegacion/ubicacion'
import { useConteoInicial } from '../pages/inventario/useConteoInicial'
import { BarraSuperior } from './BarraSuperior'
import { ColumnaDeIconos } from './ColumnaDeIconos'
import { PanelContextual } from './PanelContextual'
import { ContextoMenuRecogido, useEstadoDelMenu } from './useMenuRecogido'

// Marco «Tablero» con sesión abierta: columna de iconos con los módulos, panel con las pantallas del módulo
// abierto, barra superior, el contenido de la pantalla y la barra de estado.

export function Estructura() {
  const usuario = useUsuario()
  const salud = useSalud()
  const { pathname } = useLocation()
  const { recogido, alternar } = useEstadoDelMenu()
  // Solo el dueño ve la entrada del inventario inicial, y únicamente mientras el conteo siga abierto.
  const conteo = useConteoInicial(usuario.role === 'owner')
  const visible = (destino: Destino) =>
    puedeVer(destino, usuario.role) && (!destino.soloConConteoAbierto || conteo.data?.is_open === true)

  const modulos = MENU_PRINCIPAL.filter(visible)
  const moduloActual = moduloDe(pathname)
  const pantallas = pantallasDe(moduloActual, usuario.role)

  // Ctrl+B recoge o expande el panel, como en los editores de escritorio.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 'b' || evento.repeat) return
      if (document.querySelector('[role="dialog"]')) return
      evento.preventDefault()
      alternar()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [alternar])

  return (
    <ContextoMenuRecogido.Provider value={recogido}>
      <div className={`estructura${recogido ? ' estructura--recogida' : ''}`}>
        {/* Un botón y no un enlace con "#": en las rutas por hash cambiaría la pantalla. */}
        <button
          type="button"
          className="saltar-al-contenido"
          onClick={() => document.getElementById('contenido')?.focus()}
        >
          Saltar al contenido
        </button>
        <ColumnaDeIconos
          modulos={modulos.filter((modulo) => modulo.ruta !== DESTINOS.configuracion.ruta)}
          ajustes={modulos.find((modulo) => modulo.ruta === DESTINOS.configuracion.ruta)}
          moduloActual={moduloActual}
          recogido={recogido}
          onAlternar={alternar}
        />
        {!recogido && <PanelContextual modulo={moduloActual} pantallas={pantallas} />}
        <div className="estructura__derecha">
          <BarraSuperior />
          <main id="contenido" className="estructura__contenido" tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="barra-de-estado">
            <p
              className={`barra-de-estado__conexion barra-de-estado__conexion--${salud.isSuccess ? 'si' : salud.isError ? 'no' : 'espera'}`}
            >
              {salud.isSuccess ? 'Conectado' : salud.isError ? 'Sin conexión con el programa' : 'Conectando…'}
            </p>
            {salud.isSuccess && <p className="barra-de-estado__version">Versión {salud.data.version}</p>}
          </footer>
        </div>
      </div>
    </ContextoMenuRecogido.Provider>
  )
}
