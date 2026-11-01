import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useUsuario } from '../auth/useUsuario'
import { MENU_PRINCIPAL, puedeVer } from '../navegacion/destinos'

// Marco de la aplicación con sesión abierta: menú lateral según el rol y el contenido de la pantalla.
export function Estructura() {
  const usuario = useUsuario()
  const { cerrarSesion } = useAuth()
  const [saliendo, setSaliendo] = useState(false)

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
        <p className="estructura__marca">Punto Moto</p>
        <nav aria-label="Principal">
          <ul className="menu">
            {MENU_PRINCIPAL.filter((destino) => puedeVer(destino, usuario.role)).map((destino) => (
              <li key={destino.ruta}>
                <NavLink to={destino.ruta} end={destino.ruta === '/'} className="menu__enlace">
                  {destino.etiqueta}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="estructura__usuario">
          <p className="estructura__nombre">{usuario.display_name}</p>
          <p className="estructura__rol">{usuario.role_label}</p>
          <button type="button" className="boton boton--secundario" onClick={alSalir} disabled={saliendo}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main id="contenido" className="estructura__contenido" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
