import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { obtenerVenta } from '../../api/ventas'
import { Ficha } from '../../components/Ficha'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Detalle de una venta junto a la lista: total, cliente, pago, productos y servicios. */
export function FichaDeVenta({ id, numero, onCerrar }: { id: number; numero: number; onCerrar: () => void }) {
  const venta = useQuery({ queryKey: [...claves.ventas, 'detalle', id], queryFn: ({ signal }) => obtenerVenta(id, signal) })
  const datos = venta.data
  return (
    <Ficha
      titulo={`Venta N.º ${numero}`}
      modulo="Ventas"
      onCerrar={onCerrar}
      acciones={
        <Link to={`${DESTINOS.ventas.ruta}/${id}`} className="boton boton--auto">
          Abrir el recibo
        </Link>
      }
    >
      {venta.isPending && <p className="texto-suave">Cargando la venta…</p>}
      {venta.isError && <p className="texto-suave">No se pudo cargar la venta.</p>}
      {datos && (
        <>
          <p className="ficha__cifra">
            {formatearPesos(datos.total)}
            {datos.is_voided && <span className="etiqueta etiqueta--peligro">Anulada</span>}
          </p>
          <dl className="ficha__datos">
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
              <dd className="ficha__fecha">{formatearFechaHora(datos.created_at)}</dd>
            </div>
          </dl>
          <h4 className="ficha__subtitulo">Productos y servicios</h4>
          <ul className="ficha__lineas">
            {datos.items.map((linea) => (
              <li key={linea.id}>
                <span className="ficha__linea-texto">
                  {linea.quantity} × {linea.product.name}
                </span>
                <span className="ficha__linea-monto">{formatearPesos(linea.subtotal)}</span>
              </li>
            ))}
            {datos.services.map((servicio) => (
              <li key={`servicio-${servicio.id}`}>
                <span className="ficha__linea-texto">
                  {servicio.service_type.name}
                  <span className="ficha__linea-detalle">{servicio.mechanic.name}</span>
                </span>
                <span className="ficha__linea-monto">{formatearPesos(servicio.labor_price)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Ficha>
  )
}
