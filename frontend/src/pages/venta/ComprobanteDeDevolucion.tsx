import { Link } from 'react-router'
import type { SaleReturnDetail } from '../../api/types'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Comprobante de una devolución registrada, con productos, servicios, reembolso y descuento al mecánico si aplica. */
export function ComprobanteDeDevolucion({ devolucion }: { devolucion: SaleReturnDetail }) {
  return (
    <article className="recibo" aria-label={`Devolución n.º ${devolucion.number}`}>
      <header className="recibo__encabezado">
        <p className="recibo__numero">Devolución n.º {devolucion.number}</p>
        <p className="texto-suave">
          <Link to={`/venta/historial/${devolucion.sale}`}>Venta n.º {devolucion.sale_number}</Link> ·{' '}
          {formatearFechaHora(devolucion.created_at)} · Registró {devolucion.created_by}
        </p>
        <p>
          Cliente: <strong>{devolucion.customer ? devolucion.customer.name : 'Sin cliente'}</strong>
          {devolucion.customer?.phone && ` · ${devolucion.customer.phone}`}
        </p>
        <p>
          Causa: <strong>{devolucion.cause_label}</strong> · Motivo: {devolucion.reason}
        </p>
      </header>
      <table className="tabla">
        <caption className="solo-lectores">Productos y servicios devueltos</caption>
        <thead>
          <tr>
            <th scope="col">Detalle</th>
            <th scope="col" className="tabla__numero">
              Cant.
            </th>
            <th scope="col" className="tabla__numero">
              Precio
            </th>
            <th scope="col" className="tabla__numero">
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {devolucion.items.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {item.description}
                <span className="tabla__detalle">{item.condition_label}</span>
              </th>
              <td className="tabla__numero">{item.quantity}</td>
              <td className="tabla__numero">{formatearPesos(item.unit_price)}</td>
              <td className="tabla__numero">{formatearPesos(item.subtotal)}</td>
            </tr>
          ))}
          {devolucion.services.map((servicio) => (
            <tr key={`servicio-${servicio.id}`}>
              <th scope="row">
                {servicio.service_type.code} · {servicio.service_type.name}
                <span className="tabla__detalle">
                  {[`Mecánico: ${servicio.mechanic.name}`, servicio.details].filter(Boolean).join(' · ')}
                </span>
              </th>
              <td className="tabla__numero">1</td>
              <td className="tabla__numero">{formatearPesos(servicio.labor_price)}</td>
              <td className="tabla__numero">{formatearPesos(servicio.labor_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total reembolsado
            </th>
            <td className="tabla__numero">
              <strong>{formatearPesos(devolucion.total)}</strong>
            </td>
          </tr>
          {devolucion.refunds.map((reembolso) => (
            <tr key={reembolso.method}>
              <th scope="row" colSpan={3} className="recibo__pago">
                {reembolso.method_label}
              </th>
              <td className="tabla__numero">{formatearPesos(reembolso.amount)}</td>
            </tr>
          ))}
        </tfoot>
      </table>
      {devolucion.mechanic_deduction && (
        <p className="texto-suave">
          Descuento a {devolucion.mechanic_deduction.mechanic.name}:{' '}
          <strong>{formatearPesos(devolucion.mechanic_deduction.amount)}</strong> (pendiente por descontar:{' '}
          {formatearPesos(devolucion.mechanic_deduction.pending_amount)}).
        </p>
      )}
    </article>
  )
}
