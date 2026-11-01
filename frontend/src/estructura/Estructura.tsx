import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useUsuario } from '../auth/useUsuario'
import { useNegocio } from '../hooks/useNegocio'
import { useSalud } from '../hooks/useSalud'
import { MENU_PRINCIPAL, puedeVer, type Destino } from '../navegacion/destinos'
import { useConteoInicial } from '../pages/inventario/useConteoInicial'

// Marco de la aplicación con sesión abierta: menú lateral según el rol, barra superior con el negocio y
// la persona que tiene la sesión, y el contenido de la pantalla.

/** Iniciales para el círculo de la barra: «Carlos Pérez» → «CP». */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0].toUpperCase())
    .join('')

export function Estructura() {
  const usuario = useUsuario()
  const { cerrarSesion } = useAuth()
  const [saliendo, setSaliendo] = useState(false)
  // Mientras el dueño no llene los datos del negocio, o si no se pueden cargar, se muestra el nombre del programa.
  const negocio = useNegocio()
  const nombreDelNegocio = negocio.data?.name.trim() || 'Punto Moto'
  const salud = useSalud()
  // Solo el dueño ve la entrada del inventario inicial, y únicamente mientras el conteo siga abierto.
  const conteo = useConteoInicial(usuario.role === 'owner')
  const visible = (destino: Destino) =>
    puedeVer(destino, usuario.role) && (!destino.soloConConteoAbierto || conteo.data?.is_open === true)

  async function alSalir() {
    setSaliendo(true)
    await cerrarSesion()
  }

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
        {/* data-tauri-drag-region: si la ventana se configura sin barra de título nativa, esta barra sirve para arrastrarla. */}
        <header className="navbar" data-tauri-drag-region>
          <p className="navbar__negocio">{nombreDelNegocio}</p>
          <div className="navbar__usuario">
            <span className="navbar__iniciales" aria-hidden="true">
              {iniciales(usuario.display_name)}
            </span>
            <div className="navbar__datos">
              <p className="navbar__nombre">{usuario.display_name}</p>
              <p className="navbar__rol">{usuario.role_label}</p>
            </div>
            <button type="button" className="boton boton--secundario boton--auto" onClick={alSalir} disabled={saliendo}>
              Cerrar sesión
            </button>
          </div>
        </header>
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
