import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { obtenerDevolucion } from '../../api/ventas'
import { Ficha } from '../../components/Ficha'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Detalle de una devolución junto a la lista: qué se devolvió y en qué estado. */
export function FichaDeDevolucion({ id, numero, onCerrar }: { id: number; numero: number; onCerrar: () => void }) {
  const devolucion = useQuery({
    queryKey: [...claves.devoluciones, 'detalle', id],
    queryFn: ({ signal }) => obtenerDevolucion(id, signal),
  })
  const datos = devolucion.data
  return (
    <Ficha
      titulo={`Devolución N.º ${numero}`}
      modulo="Devoluciones"
      onCerrar={onCerrar}
      acciones={
        <Link to={`${DESTINOS.devoluciones.ruta}/${id}`} className="boton boton--auto">
          Abrir el comprobante
        </Link>
      }
    >
      {devolucion.isPending && <p className="texto-suave">Cargando la devolución…</p>}
      {devolucion.isError && <p className="texto-suave">No se pudo cargar la devolución.</p>}
      {datos && (
        <>
          <p className="ficha__cifra">{formatearPesos(datos.total)}</p>
          <dl className="ficha__datos">
            <div>
              <dt>Venta</dt>
              <dd>N.º {datos.sale_number}</dd>
            </div>
            <div>
              <dt>Causa</dt>
              <dd>{datos.cause_label}</dd>
            </div>
            <div>
              <dt>Cliente</dt>
              <dd>{datos.customer?.name ?? 'Sin cliente'}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd className="ficha__fecha">{formatearFechaHora(datos.created_at)}</dd>
            </div>
          </dl>
          <h4 className="ficha__subtitulo">Lo devuelto</h4>
          <ul className="ficha__lineas">
            {datos.items.map((linea) => (
              <li key={linea.id}>
                <span className="ficha__linea-texto">
                  {linea.quantity} × {linea.product.name}
                  <span className="ficha__linea-detalle">{linea.condition_label}</span>
                </span>
                <span className="ficha__linea-monto">{formatearPesos(linea.subtotal)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Ficha>
  )
}
