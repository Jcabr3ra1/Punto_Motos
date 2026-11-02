import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { listarAbonos, listarCompras, obtenerProveedor, type FiltrosDeCompras } from '../../api/compras'
import { claves } from '../../api/consultas'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia, formatearFechaHora } from '../../utilidades/fechas'
import { ESTADO_DE_PAGO } from './etiquetas'

// Estado de cuenta de un proveedor. No tiene ruta propia en la API: se arma con tres consultas
// (docs/backend/API.md#compras-y-proveedores).
export function EstadoDeCuenta({ proveedorId, onAbonar }: { proveedorId: number; onAbonar: () => void }) {
  const proveedor = useQuery({
    queryKey: [...claves.proveedores, proveedorId],
    queryFn: ({ signal }) => obtenerProveedor(proveedorId, signal),
  })
  const filtrosDeSaldo: FiltrosDeCompras = { supplier: proveedorId, payment_status: ['pending', 'partial'] }
  const compras = useQuery({
    queryKey: [...claves.compras, filtrosDeSaldo],
    queryFn: ({ signal }) => listarCompras(filtrosDeSaldo, signal),
  })
  const abonos = useQuery({
    queryKey: [...claves.abonos, { supplier: proveedorId }],
    queryFn: ({ signal }) => listarAbonos({ supplier: proveedorId }, signal),
  })

  if (proveedor.isPending) return <Cargando />
  if (proveedor.isError) return <ErrorDeCarga error={proveedor.error} onReintentar={() => void proveedor.refetch()} />

  return (
    <>
      <div className="barra-de-acciones">
        <dl className="avance" aria-label="Saldo del proveedor">
          <div>
            <dt>Se le debe</dt>
            <dd>{formatearPesos(proveedor.data.balance_due)}</dd>
          </div>
        </dl>
        {proveedor.data.balance_due > 0 && (
          <button type="button" className="boton boton--auto" onClick={onAbonar}>
            Abonar
          </button>
        )}
      </div>

      <Titulo nivel={3}>Compras con saldo</Titulo>
      {compras.isPending && <Cargando />}
      {compras.isError && <ErrorDeCarga error={compras.error} onReintentar={() => void compras.refetch()} />}
      {compras.isSuccess &&
        (compras.data.count === 0 ? (
          <p className="texto-suave">No hay compras con saldo pendiente.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Compras con saldo</caption>
              <thead>
                <tr>
                  <th scope="col">Compra</th>
                  <th scope="col">Recibida</th>
                  <th scope="col" className="tabla__numero">
                    Total
                  </th>
                  <th scope="col" className="tabla__numero">
                    Saldo
                  </th>
                  <th scope="col">Pago</th>
                </tr>
              </thead>
              <tbody>
                {compras.data.results.map((compra) => (
                  <tr key={compra.id}>
                    <th scope="row">
                      <Link to={`/compras/lista/${compra.id}`}>{compra.document_number || `Compra n.º ${compra.id}`}</Link>
                    </th>
                    <td>{compra.received_at ? formatearFechaHora(compra.received_at) : '—'}</td>
                    <td className="tabla__numero">{formatearPesos(compra.total)}</td>
                    <td className="tabla__numero">{formatearPesos(compra.balance_due)}</td>
                    <td>{compra.payment_status ? ESTADO_DE_PAGO[compra.payment_status] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Titulo nivel={3}>Abonos</Titulo>
      {abonos.isPending && <Cargando />}
      {abonos.isError && <ErrorDeCarga error={abonos.error} onReintentar={() => void abonos.refetch()} />}
      {abonos.isSuccess &&
        (abonos.data.count === 0 ? (
          <p className="texto-suave">Todavía no hay abonos a este proveedor.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Abonos al proveedor</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha de pago</th>
                  <th scope="col" className="tabla__numero">
                    Valor
                  </th>
                  <th scope="col">Medio</th>
                  <th scope="col">Notas</th>
                </tr>
              </thead>
              <tbody>
                {abonos.data.results.map((abono) => (
                  <tr key={abono.id}>
                    <td>{formatearDia(abono.paid_on)}</td>
                    <td className="tabla__numero">{formatearPesos(abono.amount)}</td>
                    <td>{abono.method_label}</td>
                    <td>{abono.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {abonos.isSuccess && abonos.data.count > abonos.data.results.length && (
        <p className="texto-suave">
          Se muestran los {abonos.data.results.length} abonos más recientes. Los demás están en la pestaña Abonos.
        </p>
      )}
    </>
  )
}
