import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { listarVentas } from '../../api/ventas'
import { useHoy } from '../../hooks/useHoy'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { VentanaDeRecibo } from '../venta/DetalleDeVenta'
import { CADA_MINUTO, horaDe } from './formato'

/** Las ventas más recientes de hoy, incluidas las anuladas (tachadas). Cada recibo abre la venta. */
export function TablaDeVentas({
  titulo,
  cuantas,
  completa,
  reciboEnVentana = false,
}: {
  titulo: string
  cuantas: number
  completa: boolean
  reciboEnVentana?: boolean
}) {
  const hoy = useHoy()
  const idTitulo = useId()
  const [recibo, setRecibo] = useState<{ id: number; numero: number } | null>(null)
  const ventas = useQuery({
    queryKey: [...claves.ventas, 'recientes', hoy, cuantas],
    queryFn: ({ signal }) => listarVentas({ date_from: hoy, date_to: hoy, page_size: cuantas }, signal),
    refetchInterval: CADA_MINUTO,
  })
  return (
    <section className="panel-inicio">
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          {titulo}
        </h2>
        <Link to={DESTINOS.ventas.ruta} className="panel-inicio__enlace">
          Ver todas
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
      {ventas.isPending ? (
        <div className="panel-inicio__vacio" aria-busy="true">
          <span className="esqueleto instrumento__esqueleto-linea" />
        </div>
      ) : !ventas.data ? (
        <div className="panel-inicio__vacio inicio-error-bloque">
          <span className="instrumento__error">No se pudieron cargar las ventas.</span>
          <button type="button" className="boton boton--auto boton--secundario inicio-boton-reintentar" onClick={() => void ventas.refetch()}>
            Reintentar
          </button>
        </div>
      ) : ventas.data.results.length === 0 ? (
        <p className="panel-inicio__vacio">Todavía no hay ventas hoy.</p>
      ) : (
        <>
          <div className="panel-inicio__tabla">
            <table className="tabla" aria-labelledby={idTitulo}>
              <thead>
                <tr>
                  <th scope="col">Recibo</th>
                  <th scope="col">Hora</th>
                  <th scope="col">Cliente</th>
                  {completa && <th scope="col" className="tabla__numero col-secundaria">Productos</th>}
                  {completa && <th scope="col" className="col-secundaria">Vendió</th>}
                  <th scope="col" className="tabla__numero">Total</th>
                </tr>
              </thead>
              <tbody>
                {ventas.data.results.map((venta) => {
                  const codigo = `#${String(venta.number).padStart(4, '0')}`
                  return (
                    <tr key={venta.id} className={venta.is_voided ? 'tabla__fila--anulada' : undefined}>
                      <td>
                        {reciboEnVentana ? (
                          <button
                            type="button"
                            className="tabla__codigo"
                            onClick={() => setRecibo({ id: venta.id, numero: venta.number })}
                          >
                            {codigo}
                          </button>
                        ) : (
                          <Link to={`${DESTINOS.ventas.ruta}/${venta.id}`} className="tabla__codigo">
                            {codigo}
                          </Link>
                        )}
                        {venta.is_voided && <span className="solo-lectores"> (anulada)</span>}
                      </td>
                      <td>{horaDe(venta.created_at)}</td>
                      <td className="tabla__texto-largo">{venta.customer?.name ?? 'Sin cliente'}</td>
                      {completa && (
                        <td className="tabla__numero col-secundaria">
                          {venta.items_count}
                          {venta.services_count > 0 && ' + taller'}
                        </td>
                      )}
                      {completa && <td className="col-secundaria">{venta.created_by}</td>}
                      <td className="tabla__numero">{formatearPesos(venta.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {ventas.isRefetchError && ventas.dataUpdatedAt > 0 && (
            <div className="inicio-dato-previo inicio-dato-previo--tabla">
              <span>
                Último dato válido: {formatearFechaHora(new Date(ventas.dataUpdatedAt).toISOString())} · No se pudo actualizar.
              </span>
              <button type="button" className="inicio-enlace-reintentar" onClick={() => void ventas.refetch()}>
                Reintentar
              </button>
            </div>
          )}
        </>
      )}
      {recibo && <VentanaDeRecibo id={recibo.id} numero={recibo.numero} onCerrar={() => setRecibo(null)} />}
    </section>
  )
}
