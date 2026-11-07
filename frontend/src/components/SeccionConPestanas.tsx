import { NavLink, Outlet } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { useMenuRecogido } from '../estructura/useMenuRecogido'
import { puedeVer, type Destino } from '../navegacion/destinos'

/**
 * Sección con título; la subpantalla elegida se muestra debajo. Sus pantallas están en el panel contextual del
 * menú; si ese panel está recogido, se muestran aquí como pestañas para no perder el camino.
 */
export function SeccionConPestanas({ titulo, destinos }: { titulo: string; destinos: readonly Destino[] }) {
  const usuario = useUsuario()
  const recogido = useMenuRecogido()
  return (
    <section>
      <h1>{titulo}</h1>
      {recogido && (
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
      )}
      <Outlet />
    </section>
  )
}
