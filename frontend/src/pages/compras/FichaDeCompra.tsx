import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { obtenerCompra } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { Purchase } from '../../api/types'
import { Registro } from '../../components/Registro'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { ESTADO_DE_PAGO } from './etiquetas'

/** La compra elegida en el registro negro: total, estado, saldo y productos; «Abrir la compra» la abre en el panel. */
export function FichaDeCompra({ compra, abrir, onCerrar }: { compra: Purchase; abrir: string; onCerrar: () => void }) {
  const detalle = useQuery({
    queryKey: [...claves.compras, 'detalle', compra.id],
    queryFn: ({ signal }) => obtenerCompra(compra.id, signal),
  })
  const borrador = compra.status === 'draft'
  return (
    <Registro
      titulo={compra.document_number || `Compra n.º ${compra.id}`}
      modulo="Compras"
      onCerrar={onCerrar}
      acciones={
        <Link to={abrir} className="boton">
          Abrir la compra
        </Link>
      }
    >
      <p className="registro__cifra">
        <span className="registro__total">{formatearPesos(compra.total)}</span>
        {borrador && <span className="etiqueta etiqueta--neutra">Borrador</span>}
      </p>
      <dl className="registro__datos">
        <div>
          <dt>Proveedor</dt>
          <dd>{compra.supplier.name}</dd>
        </div>
        <div>
          <dt>Creada</dt>
          <dd>{formatearFechaHora(compra.created_at)}</dd>
        </div>
        {!borrador && (
          <>
            <div>
              <dt>Saldo</dt>
              <dd className={compra.balance_due > 0 ? 'registro__alerta' : undefined}>{formatearPesos(compra.balance_due)}</dd>
            </div>
            <div>
              <dt>Pago</dt>
              <dd>{compra.payment_status ? ESTADO_DE_PAGO[compra.payment_status] : '—'}</dd>
            </div>
          </>
        )}
      </dl>
      <h4 className="registro__subtitulo">Productos</h4>
      {detalle.isPending && <p className="registro__nota">Cargando…</p>}
      {detalle.isError && <p className="registro__nota">No se pudieron cargar los productos.</p>}
      {detalle.data &&
        (detalle.data.items.length === 0 ? (
          <p className="registro__nota">Todavía no tiene productos.</p>
        ) : (
          <ul className="registro__lineas">
            {detalle.data.items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.quantity} × {item.product.name}
                </span>
                <span className="registro__monto">{formatearPesos(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        ))}
    </Registro>
  )
}
