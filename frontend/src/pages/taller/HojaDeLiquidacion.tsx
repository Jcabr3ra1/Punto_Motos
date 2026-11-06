import type { MechanicSettlementDetail } from '../../api/types'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia, formatearFechaHora } from '../../utilidades/fechas'

/** La hoja del mecánico: los servicios que se le pagaron, su mano de obra, el porcentaje y lo pagado. */
export function HojaDeLiquidacion({ liquidacion }: { liquidacion: MechanicSettlementDetail }) {
  return (
    <article className="recibo" aria-label={`Hoja de liquidación de ${liquidacion.mechanic.name}`}>
      <header className="recibo__encabezado">
        <p className="recibo__numero">Liquidación de {liquidacion.mechanic.name}</p>
        <p className="texto-suave">
          Día {formatearDia(liquidacion.date)} · Pagado el {formatearFechaHora(liquidacion.created_at)} por {liquidacion.created_by} ·{' '}
          {liquidacion.method_label}
        </p>
      </header>
      <table className="tabla">
        <caption className="solo-lectores">Servicios pagados</caption>
        <thead>
          <tr>
            <th scope="col">Venta</th>
            <th scope="col">Servicio</th>
            <th scope="col">Cliente</th>
            <th scope="col" className="tabla__numero">
              Mano de obra
            </th>
          </tr>
        </thead>
        <tbody>
          {liquidacion.services.map((servicio) => (
            <tr key={servicio.id}>
              <td>N.º {servicio.sale_number}</td>
              <th scope="row">
                {servicio.service_type.code} · {servicio.service_type.name}
                {servicio.details && <span className="tabla__detalle">{servicio.details}</span>}
              </th>
              <td>{servicio.customer || 'Sin cliente'}</td>
              <td className="tabla__numero">{formatearPesos(servicio.labor_price)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Mano de obra
            </th>
            <td className="tabla__numero">{formatearPesos(liquidacion.labor_total)}</td>
          </tr>
          <tr>
            <th scope="row" colSpan={3}>
              Pagado al mecánico ({liquidacion.percentage} %)
            </th>
            <td className="tabla__numero">
              <strong>{formatearPesos(liquidacion.amount)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </article>
  )
}
