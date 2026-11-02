import { NavLink, Outlet } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { puedeVer, type Destino } from '../navegacion/destinos'

/** Sección con título y pestañas según el rol; la subpantalla elegida se muestra debajo. */
export function SeccionConPestanas({ titulo, destinos }: { titulo: string; destinos: readonly Destino[] }) {
  const usuario = useUsuario()
  return (
    <section>
      <h1>{titulo}</h1>
      <nav aria-label={titulo} className="pestanas">
        <ul>
          {destinos
            .filter((destino) => puedeVer(destino, usuario.role))
            .map((destino) => (
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
