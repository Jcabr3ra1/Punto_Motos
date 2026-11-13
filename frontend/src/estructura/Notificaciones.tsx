import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bell } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { claves } from '../api/consultas'
import { consultarNotificaciones } from '../api/negocio'
import { DESTINOS } from '../navegacion/destinos'

const CADA_MINUTO = 60_000

function plural(cantidad: number, singular: string, varios: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : varios}`
}

/** Campanita en la barra superior con productos por acabarse y avisos operativos pendientes. */
export function Notificaciones() {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const idPanel = useId()

  const consulta = useQuery({
    queryKey: claves.notificaciones,
    queryFn: ({ signal }) => consultarNotificaciones(signal),
    refetchInterval: CADA_MINUTO,
  })

  useEffect(() => {
    if (!abierto) return
    const alPulsarAfuera = (evento: PointerEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false)
      }
    }
    const alTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAbierto(false)
        botonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', alPulsarAfuera)
    window.addEventListener('keydown', alTeclar)
    return () => {
      document.removeEventListener('pointerdown', alPulsarAfuera)
      window.removeEventListener('keydown', alTeclar)
    }
  }, [abierto])

  const avisos = consulta.data?.alerts ?? []
  const porReponer = consulta.data?.low_stock ?? []
  const totalPorReponer = consulta.data?.low_stock_count ?? 0
  const totalAlertas = totalPorReponer + avisos.length
  const etiquetaBoton =
    totalAlertas > 0 ? `Notificaciones (${plural(totalAlertas, 'alerta', 'alertas')})` : 'Notificaciones'

  return (
    <div ref={contenedor} className="notificaciones">
      <button
        ref={botonRef}
        type="button"
        className="navbar__notificaciones"
        onClick={() => setAbierto((v) => !v)}
        aria-label={etiquetaBoton}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        title={etiquetaBoton}
      >
        <Bell aria-hidden="true" size={18} strokeWidth={1.75} />
        {totalAlertas > 0 && (
          <span className="notificaciones__insignia" aria-hidden="true">
            {totalAlertas > 99 ? '99+' : totalAlertas}
          </span>
        )}
      </button>

      {abierto && (
        <section id={idPanel} className="notificaciones__panel" aria-label="Notificaciones del negocio">
          <div className="notificaciones__cabecera">
            <h2>Notificaciones</h2>
            <span>{totalAlertas > 0 ? plural(totalAlertas, 'alerta', 'alertas') : 'Al día'}</span>
          </div>

          {totalAlertas === 0 ? (
            <p className="notificaciones__vacio">
              No hay productos por acabarse ni avisos pendientes.
            </p>
          ) : (
            <div className="notificaciones__cuerpo">
              {avisos.length > 0 && (
                <div className="notificaciones__grupo">
                  <p className="notificaciones__subtitulo">Atención del negocio</p>
                  <ul className="notificaciones__lista">
                    {avisos.map((aviso) => (
                      <li key={aviso.key}>
                        <Link
                          to={aviso.route}
                          className={`notificaciones__item notificaciones__item--${aviso.level === 'urgent' ? 'urgente' : 'aviso'}`}
                          onClick={() => setAbierto(false)}
                        >
                          <div>
                            <strong>{aviso.title}</strong>
                            <p>{aviso.detail}</p>
                          </div>
                          <ArrowRight aria-hidden="true" size={14} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {porReponer.length > 0 && (
                <div className="notificaciones__grupo">
                  <div className="notificaciones__grupo-cabecera">
                    <p className="notificaciones__subtitulo">
                      Productos por acabarse ({totalPorReponer})
                    </p>
                    <Link
                      to={DESTINOS.productos.ruta}
                      className="notificaciones__ver-todo"
                      onClick={() => setAbierto(false)}
                    >
                      Ver productos
                    </Link>
                  </div>
                  <ul className="notificaciones__lista">
                    {porReponer.map((prod) => {
                      const agotado = prod.stock <= 0
                      return (
                        <li key={prod.id}>
                          <Link
                            to={DESTINOS.productos.ruta}
                            className={`notificaciones__item notificaciones__item--${agotado ? 'urgente' : 'aviso'}`}
                            onClick={() => setAbierto(false)}
                          >
                            <div>
                              <strong>{prod.name}</strong>
                              <p>{prod.code}</p>
                            </div>
                            <span
                              className={`notificaciones__estado notificaciones__estado--${agotado ? 'agotado' : 'bajo'}`}
                            >
                              {agotado ? 'Agotado' : `${prod.stock} / mín. ${prod.min_stock}`}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  {totalPorReponer > porReponer.length && (
                    <Link
                      to={DESTINOS.productos.ruta}
                      className="notificaciones__pie"
                      onClick={() => setAbierto(false)}
                    >
                      Y {totalPorReponer - porReponer.length} productos más por reponer
                      <ArrowRight aria-hidden="true" size={14} />
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
