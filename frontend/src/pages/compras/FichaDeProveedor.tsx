import { useQuery } from '@tanstack/react-query'
import { listarCompras, type FiltrosDeCompras } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { Supplier } from '../../api/types'
import { Registro } from '../../components/Registro'
import { formatearPesos } from '../../utilidades/dinero'

/** Cuántas compras con saldo se ven en el registro; el resto está en el estado de cuenta. */
const A_LA_VISTA = 5

/** El proveedor elegido en el registro negro: lo que se le debe, sus datos y sus compras con saldo. */
export function FichaDeProveedor({
  proveedor,
  onAbonar,
  onEstadoDeCuenta,
  onCerrar,
}: {
  proveedor: Supplier
  onAbonar: () => void
  onEstadoDeCuenta: () => void
  onCerrar: () => void
}) {
  const filtros: FiltrosDeCompras = { supplier: proveedor.id, payment_status: ['pending', 'partial'], page_size: A_LA_VISTA }
  const compras = useQuery({
    queryKey: [...claves.compras, filtros],
    queryFn: ({ signal }) => listarCompras(filtros, signal),
    enabled: proveedor.balance_due > 0,
  })
  const debe = proveedor.balance_due > 0
  return (
    <Registro
      titulo={proveedor.name}
      modulo="Proveedores"
      onCerrar={onCerrar}
      acciones={
        <>
          {debe && (
            <button type="button" className="boton" onClick={onAbonar}>
              Abonar
            </button>
          )}
          <button type="button" className="boton boton--secundario" onClick={onEstadoDeCuenta}>
            Estado de cuenta
          </button>
        </>
      }
    >
      <p className="registro__cifra">
        <span className="registro__total">{formatearPesos(proveedor.balance_due)}</span>
        <span className="registro__detalle">{debe ? 'se le debe' : 'no se le debe nada'}</span>
      </p>
      <dl className="registro__datos">
        <div>
          <dt>NIT o cédula</dt>
          <dd>{proveedor.tax_id || '—'}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{proveedor.phone || '—'}</dd>
        </div>
        {proveedor.notes && (
          <div>
            <dt>Notas</dt>
            <dd>{proveedor.notes}</dd>
          </div>
        )}
        {!proveedor.is_active && (
          <div>
            <dt>Estado</dt>
            <dd>Desactivado</dd>
          </div>
        )}
      </dl>
      {debe && (
        <>
          <h4 className="registro__subtitulo">Compras con saldo</h4>
          {compras.isPending && <p className="registro__nota">Cargando…</p>}
          {compras.isError && <p className="registro__nota">No se pudieron cargar las compras.</p>}
          {compras.data && (
            <ul className="registro__lineas">
              {compras.data.results.map((compra) => (
                <li key={compra.id}>
                  <span>{compra.document_number || `Compra n.º ${compra.id}`}</span>
                  <span className="registro__monto">{formatearPesos(compra.balance_due)}</span>
                </li>
              ))}
            </ul>
          )}
          {compras.data && compras.data.count > A_LA_VISTA && (
            <p className="registro__nota">y {compras.data.count - A_LA_VISTA} más en el estado de cuenta</p>
          )}
        </>
      )}
    </Registro>
  )
}
