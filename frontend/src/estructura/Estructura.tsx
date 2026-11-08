import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { hayVentanaAbierta } from '../components/useFocoAtrapado'
import { useSalud } from '../hooks/useSalud'
import { useConteoInicial } from '../pages/inventario/useConteoInicial'
import { BarraSuperior } from './BarraSuperior'
import { Buscador } from './Buscador'
import { DESTINOS } from '../navegacion/destinos'
import { MenuLateral } from './MenuLateral'
import { useEstadoDelMenu } from './useMenuRecogido'

// Marco «Tablero» con sesión abierta: menú lateral por secciones, barra superior, el contenido de la pantalla y la
// barra de estado.

export function Estructura() {
  const usuario = useUsuario()
  const salud = useSalud()
  // En Vender el menú se recoge solo: el mostrador necesita todo el ancho.
  const { recogido, alternar } = useEstadoDelMenu(useLocation().pathname === DESTINOS.vender.ruta)
  // Solo el dueño ve la entrada del inventario inicial, y únicamente mientras el conteo siga abierto.
  const conteo = useConteoInicial(usuario.role === 'owner')
  const [buscando, setBuscando] = useState(false)
  // Quién tenía el foco al abrir el buscador, para devolvérselo si se cierra sin elegir.
  const focoPrevio = useRef<HTMLElement | null>(null)

  function abrirBuscador() {
    // No se abre encima de otra ventana (un panel, una confirmación o el diálogo de actualizaciones).
    if (hayVentanaAbierta()) return
    focoPrevio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setBuscando(true)
  }

  // A dónde vuelve el foco al cerrar el buscador; se aplica cuando ya se desmontó y la pantalla dejó de estar inerte.
  const focoAlCerrar = useRef<'previo' | 'contenido' | null>(null)

  function cerrarBuscador(eligio: boolean) {
    focoAlCerrar.current = eligio ? 'contenido' : 'previo'
    setBuscando(false)
  }

  useEffect(() => {
    if (buscando || !focoAlCerrar.current) return
    // Al abrir una pantalla, el foco va a su contenido; si no, vuelve a donde estaba.
    const previo = focoPrevio.current
    const objetivo = focoAlCerrar.current === 'previo' && previo?.isConnected ? previo : document.getElementById('contenido')
    focoAlCerrar.current = null
    objetivo?.focus()
  }, [buscando])

  // Ctrl+K abre el buscador de pantallas desde cualquier lugar.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 'k' || evento.repeat) return
      evento.preventDefault()
      if (buscando) cerrarBuscador(false)
      else if (!hayVentanaAbierta()) abrirBuscador()
    }
    window.addEventListener('keydown', alPulsar, true)
    return () => window.removeEventListener('keydown', alPulsar, true)
  }, [buscando])

  // Ctrl+B recoge o expande el menú, como en los editores de escritorio.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 'b' || evento.repeat) return
      if (hayVentanaAbierta()) return
      evento.preventDefault()
      alternar()
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [alternar])

  return (
    <>
      <div className={`estructura${recogido ? ' estructura--recogida' : ''}`}>
        {/* Un botón y no un enlace con "#": en las rutas por hash cambiaría la pantalla. */}
        <button
          type="button"
          className="saltar-al-contenido"
          onClick={() => document.getElementById('contenido')?.focus()}
        >
          Saltar al contenido
        </button>
        <MenuLateral
          rol={usuario.role}
          conteoAbierto={conteo.data?.is_open === true}
          recogido={recogido}
          onAlternar={alternar}
        />
        <div className="estructura__derecha">
          <BarraSuperior onBuscar={abrirBuscador} />
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
      {buscando && <Buscador conteoAbierto={conteo.data?.is_open === true} onCerrar={cerrarBuscador} />}
    </>
  )
}
