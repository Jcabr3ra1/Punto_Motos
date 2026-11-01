import { NavLink, Outlet } from 'react-router'
import { useUsuario } from '../../auth/useUsuario'
import { MENU_CONFIGURACION, puedeVer } from '../../navegacion/destinos'

/** Marco de Configuración: pestañas según el rol y la subpantalla elegida. */
export function Configuracion() {
  const usuario = useUsuario()
  return (
    <section>
      <h1>Configuración</h1>
      <nav aria-label="Configuración" className="pestanas">
        <ul>
          {MENU_CONFIGURACION.filter((destino) => puedeVer(destino, usuario.role)).map((destino) => (
            <li key={destino.ruta}>
              <NavLink to={destino.ruta} className="pestanas__enlace">
                {destino.etiqueta}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </section>
  )
}
