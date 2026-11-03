import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listarMovimientosDeCaja } from '../../api/caja'
import { claves } from '../../api/consultas'
import type { CashSession } from '../../api/types'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Pesos con signo: `-3000` → `-$ 3.000`, `5000` → `+$ 5.000`. */
const pesosConSigno = (valor: number) => (valor < 0 ? `-${formatearPesos(-valor)}` : valor > 0 ? `+${formatearPesos(valor)}` : formatearPesos(0))

/** Cifras de una caja: inicial, esperado, transferencias y, si está cerrada, contado y diferencia. */
export function CifrasDeCaja({ caja }: { caja: CashSession }) {
  return (
    <dl className="avance" aria-label="Cifras de la caja">
      <div>
        <dt>Efectivo inicial</dt>
        <dd>{formatearPesos(caja.opening_cash)}</dd>
      </div>
      <div>
        <dt>{caja.is_open ? 'Efectivo esperado en el cajón' : 'Efectivo esperado al cierre'}</dt>
        <dd>{formatearPesos(caja.expected_cash)}</dd>
      </div>
      {caja.summary && (
        <div>
          <dt>Transferencias</dt>
          <dd>{formatearPesos(caja.summary.transfer_total)}</dd>
        </div>
      )}
      {!caja.is_open && caja.counted_cash !== null && (
        <>
          <div>
            <dt>Contado</dt>
            <dd>{formatearPesos(caja.counted_cash)}</dd>
          </div>
          <div>
            <dt>Diferencia</dt>
            <dd className={caja.difference ? 'cantidad--sale' : undefined}>
              {caja.difference === 0 || caja.difference === null
                ? 'Cuadró'
                : caja.difference > 0
                  ? `Sobran ${formatearPesos(caja.difference)}`
                  : `Faltan ${formatearPesos(-caja.difference)}`}
            </dd>
          </div>
        </>
      )}
    </dl>
  )
}

/** Resumen por tipo de movimiento, separado en efectivo y transferencia. */
export function ResumenPorTipo({ caja }: { caja: CashSession }) {
  if (!caja.summary || caja.summary.by_kind.length === 0) {
    return <p className="texto-suave">Todavía no hay movimientos en esta caja.</p>
  }
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Resumen por tipo de movimiento</caption>
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col" className="tabla__numero">
              Efectivo
            </th>
            <th scope="col" className="tabla__numero">
              Transferencia
            </th>
          </tr>
        </thead>
        <tbody>
          {caja.summary.by_kind.map((fila) => (
            <tr key={fila.kind}>
              <th scope="row">{fila.kind_label}</th>
              <td className="tabla__numero">{pesosConSigno(fila.cash)}</td>
              <td className="tabla__numero">{pesosConSigno(fila.transfer)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td className="tabla__numero">
              <strong>{pesosConSigno(caja.summary.cash_total)}</strong>
            </td>
            <td className="tabla__numero">
              <strong>{pesosConSigno(caja.summary.transfer_total)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** Movimientos de una caja, del más reciente al más antiguo. */
export function MovimientosDeCaja({ cajaId }: { cajaId: number }) {
  const [pagina, setPagina] = useState(1)
  const movimientos = useQuery({
    queryKey: [...claves.caja, 'movimientos', cajaId, pagina],
    queryFn: ({ signal }) => listarMovimientosDeCaja({ session: cajaId, page: pagina }, signal),
    placeholderData: keepPreviousData,
  })
  return (
    <>
      <Titulo nivel={3}>Movimientos</Titulo>
      {movimientos.isPending && <Cargando />}
      {movimientos.isError && <ErrorDeCarga error={movimientos.error} onReintentar={() => void movimientos.refetch()} />}
      {movimientos.isSuccess &&
        (movimientos.data.count === 0 ? (
          <p className="texto-suave">Sin movimientos.</p>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Movimientos de la caja</caption>
                <thead>
                  <tr>
                    <th scope="col">Hora</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Detalle</th>
                    <th scope="col">Medio</th>
                    <th scope="col" className="tabla__numero">
                      Valor
                    </th>
                    <th scope="col">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.data.results.map((m) => (
                    <tr key={m.id}>
                      <td className="tabla__nowrap">{formatearFechaHora(m.created_at)}</td>
                      <td>{m.kind_label}</td>
                      <td>{m.reason || '—'}</td>
                      <td>{m.method_label}</td>
                      <td className={`tabla__numero ${m.amount > 0 ? 'cantidad--entra' : 'cantidad--sale'}`}>
                        {m.amount < 0 ? `-${formatearPesos(-m.amount)}` : `+${formatearPesos(m.amount)}`}
                      </td>
                      <td>{m.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              etiqueta="Páginas de movimientos de caja"
              pagina={pagina}
              total={movimientos.data.count}
              hayAnterior={Boolean(movimientos.data.previous)}
              haySiguiente={Boolean(movimientos.data.next)}
              onCambiar={setPagina}
            />
          </>
        ))}
    </>
  )
}
