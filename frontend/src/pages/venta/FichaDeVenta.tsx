import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { obtenerVenta } from '../../api/ventas'
import { Registro } from '../../components/Registro'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** La venta elegida como un recibo en el registro negro: total, cliente, pago, productos y servicios. */
export function FichaDeVenta({ id, numero, onCerrar }: { id: number; numero: number; onCerrar: () => void }) {
  const venta = useQuery({ queryKey: [...claves.ventas, 'detalle', id], queryFn: ({ signal }) => obtenerVenta(id, signal) })
  const datos = venta.data
  return (
    <Registro
      titulo={`Venta N.º ${numero}`}
      modulo="Ventas"
      onCerrar={onCerrar}
      acciones={
        <Link to={`${DESTINOS.ventas.ruta}/${id}`} className="boton">
          Abrir el recibo
        </Link>
      }
    >
      {venta.isPending && <p className="registro__nota">Cargando la venta…</p>}
      {venta.isError && <p className="registro__nota">No se pudo cargar la venta.</p>}
      {datos && (
        <>
          <p className="registro__cifra">
            <span className={datos.is_voided ? 'registro__total registro__total--anulado' : 'registro__total'}>{formatearPesos(datos.total)}</span>
            {datos.is_voided && <span className="etiqueta etiqueta--peligro">Anulada</span>}
          </p>
          <dl className="registro__datos">
            <div>
              <dt>Cliente</dt>
              <dd>{datos.customer?.name ?? 'Sin cliente'}</dd>
            </div>
            <div>
              <dt>Vendió</dt>
              <dd>{datos.created_by}</dd>
            </div>
            <div>
              <dt>Pagó con</dt>
              <dd>{datos.payments.map((pago) => pago.method_label).join(' y ') || '—'}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{formatearFechaHora(datos.created_at)}</dd>
            </div>
          </dl>
          <h4 className="registro__subtitulo">Productos y servicios</h4>
          <ul className="registro__lineas">
            {datos.items.map((linea) => (
              <li key={linea.id}>
                <span>
                  {linea.quantity} × {linea.product.name}
                </span>
                <span className="registro__monto">{formatearPesos(linea.subtotal)}</span>
              </li>
            ))}
            {datos.services.map((servicio) => (
              <li key={`servicio-${servicio.id}`}>
                <span>
                  {servicio.service_type.name}
                  <span className="registro__detalle">Mecánico: {servicio.mechanic.name}</span>
                </span>
                <span className="registro__monto">{formatearPesos(servicio.labor_price)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Registro>
  )
}
