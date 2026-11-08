import { useQuery } from '@tanstack/react-query'
import { claves } from '../../api/consultas'
import { obtenerDevolucion } from '../../api/ventas'
import { Registro } from '../../components/Registro'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Detalle de una devolución en el registro negro: qué se devolvió y en qué estado. */
export function FichaDeDevolucion({ id, numero, onCerrar, onAbrirComprobante }: { id: number; numero: number; onCerrar: () => void; onAbrirComprobante: () => void }) {
  const devolucion = useQuery({
    queryKey: [...claves.devoluciones, 'detalle', id],
    queryFn: ({ signal }) => obtenerDevolucion(id, signal),
  })
  const datos = devolucion.data
  return (
    <Registro
      titulo={`Devolución N.º ${numero}`}
      modulo="Devoluciones"
      onCerrar={onCerrar}
      acciones={
        <button type="button" className="boton" onClick={onAbrirComprobante}>
          Abrir el comprobante
        </button>
      }
    >
      {devolucion.isPending && <p className="registro__nota">Cargando la devolución…</p>}
      {devolucion.isError && <p className="registro__nota">No se pudo cargar la devolución.</p>}
      {datos && (
        <>
          <p className="registro__cifra">
            <span className="registro__total">{formatearPesos(datos.total)}</span>
          </p>
          <dl className="registro__datos">
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
              <dd>{formatearFechaHora(datos.created_at)}</dd>
            </div>
          </dl>
          <h4 className="registro__subtitulo">Lo devuelto</h4>
          <ul className="registro__lineas">
            {datos.items.map((linea) => (
              <li key={linea.id}>
                <span>
                  {linea.quantity} × {linea.product.name}
                  <span className="registro__detalle">{linea.condition_label}</span>
                </span>
                <span className="registro__monto">{formatearPesos(linea.subtotal)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Registro>
  )
}
