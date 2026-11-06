import { NavLink } from 'react-router'
import type { Destino } from '../navegacion/destinos'

// Panel junto a la columna: el módulo abierto, para qué sirve y sus pantallas. No usa encabezados para no
// competir con el título de la pantalla.
export function PanelContextual({ modulo, pantallas }: { modulo: Destino; pantallas: readonly Destino[] }) {
  return (
    <aside className="panel-contextual">
      <p className="panel-contextual__modulo">{modulo.etiqueta}</p>
      <p className="panel-contextual__descripcion">{modulo.descripcion}</p>
      <nav aria-label={modulo.etiqueta}>
        <ul className="panel-contextual__lista">
          {pantallas.map((pantalla) => {
            const Icono = pantalla.icono
            const id = `descripcion-${pantalla.ruta.replace(/\W+/g, '-')}`
            return (
              <li key={pantalla.ruta} className="panel-contextual__item">
                <NavLink to={pantalla.ruta} end={pantalla.ruta === '/'} className="panel-contextual__enlace" aria-describedby={id}>
                  <Icono aria-hidden="true" size={16} strokeWidth={1.75} />
                  {pantalla.etiqueta}
                </NavLink>
                {/* Fuera del enlace para que su nombre sea solo la etiqueta; el enlace cubre toda la fila. */}
                <span id={id} className="panel-contextual__ayuda">
                  {pantalla.descripcion}
                </span>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
