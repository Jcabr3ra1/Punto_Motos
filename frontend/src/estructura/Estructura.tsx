import { NavLink, Outlet } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { useSalud } from '../hooks/useSalud'
import { MENU_PRINCIPAL, puedeVer, type Destino } from '../navegacion/destinos'
import { useConteoInicial } from '../pages/inventario/useConteoInicial'
import { BarraSuperior } from './BarraSuperior'

// Marco de la aplicación con sesión abierta: menú lateral según el rol, barra superior, el contenido de la
// pantalla y la barra de estado.

export function Estructura() {
  const usuario = useUsuario()
  const salud = useSalud()
  // Solo el dueño ve la entrada del inventario inicial, y únicamente mientras el conteo siga abierto.
  const conteo = useConteoInicial(usuario.role === 'owner')
  const visible = (destino: Destino) =>
    puedeVer(destino, usuario.role) && (!destino.soloConConteoAbierto || conteo.data?.is_open === true)

  return (
    <div className="estructura">
      {/* Un botón y no un enlace con "#": en las rutas por hash cambiaría la pantalla. */}
      <button
        type="button"
        className="saltar-al-contenido"
        onClick={() => document.getElementById('contenido')?.focus()}
      >
        Saltar al contenido
      </button>
      <aside className="estructura__lateral">
        <img className="estructura__logo" src="/logo.png" alt="Punto Moto" width={480} height={470} />
        <nav aria-label="Principal">
          <ul className="menu">
            {MENU_PRINCIPAL.filter(visible).map((destino) => (
              <li key={destino.ruta}>
                <NavLink to={destino.ruta} end={destino.ruta === '/'} className="menu__enlace">
                  {destino.etiqueta}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
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
  )
}
