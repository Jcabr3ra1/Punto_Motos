import type { SaleDetail } from '../../api/types'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Lo que va en el recibo, tal como lo confirmó el backend (precios y totales definitivos). */
export function Recibo({ venta, vuelto }: { venta: SaleDetail; vuelto?: number }) {
  return (
    <article className="recibo" aria-label={`Recibo n.º ${venta.number}`}>
      <header className="recibo__encabezado">
        <p className="recibo__numero">Recibo n.º {venta.number}</p>
        <p className="texto-suave">
          {formatearFechaHora(venta.created_at)} · Vendió {venta.created_by}
        </p>
        <p>
          Cliente: <strong>{venta.customer.name}</strong>
          {venta.customer.phone && ` · ${venta.customer.phone}`}
        </p>
      </header>
      {venta.is_voided && (
        <p role="status" className="aviso aviso--error">
          <strong>Venta anulada</strong>
          {venta.voided_at && ` el ${formatearFechaHora(venta.voided_at)}`}
          {venta.voided_by && ` por ${venta.voided_by}`}. Motivo: {venta.void_reason}
        </p>
      )}
      <table className="tabla">
        <caption className="solo-lectores">Productos vendidos</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
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
          {venta.items.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {item.description}
                {item.price_changed && (
                  <span className="tabla__detalle">Precio de catálogo {formatearPesos(item.list_price)}</span>
                )}
              </th>
              <td className="tabla__numero">{item.quantity}</td>
              <td className="tabla__numero">{formatearPesos(item.unit_price)}</td>
              <td className="tabla__numero">{formatearPesos(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total
            </th>
            <td className="tabla__numero">
              <strong>{formatearPesos(venta.total)}</strong>
            </td>
          </tr>
          {venta.payments.map((pago) => (
            <tr key={pago.method}>
              <th scope="row" colSpan={3} className="recibo__pago">
                {pago.method_label}
              </th>
              <td className="tabla__numero">{formatearPesos(pago.amount)}</td>
            </tr>
          ))}
          {vuelto !== undefined && vuelto > 0 && (
            <tr>
              <th scope="row" colSpan={3} className="recibo__pago">
                Vuelto
              </th>
              <td className="tabla__numero">
                <strong>{formatearPesos(vuelto)}</strong>
              </td>
            </tr>
          )}
        </tfoot>
      </table>
      {venta.notes && <p className="texto-suave">Notas: {venta.notes}</p>}
    </article>
  )
}
