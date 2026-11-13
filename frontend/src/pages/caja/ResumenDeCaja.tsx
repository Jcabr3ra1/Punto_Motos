import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Banknote } from 'lucide-react'
import { listarMovimientosDeCaja } from '../../api/caja'
import { claves } from '../../api/consultas'
import type { CashSession } from '../../api/types'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EstadoVacio } from '../../components/EstadoVacio'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos, pesosConSigno } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

/** Cifras de una caja: inicial, esperado, transferencias y, si está cerrada, contado y diferencia. */
export function CifrasDeCaja({ caja }: { caja: CashSession }) {
  return (
    <dl className="avance" aria-label="Cifras de la caja">
      <div>
        <dt>Efectivo inicial</dt>
        <dd>{formatearPesos(caja.opening_cash)}</dd>
      </div>
      <div className="avance__destacado">
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
          {caja.closing_notes && (
            <div>
              <dt>{caja.difference ? 'Explicación de la diferencia' : 'Nota del cierre'}</dt>
              <dd>{caja.closing_notes}</dd>
            </div>
          )}
        </>
      )}
    </dl>
  )
}

/** Resumen por tipo de movimiento, separado en efectivo y transferencia. */
export function ResumenPorTipo({ caja }: { caja: CashSession }) {
  if (!caja.summary) {
    return <p className="texto-suave">El resumen de esta caja no está disponible.</p>
  }
  if (caja.summary.by_kind.length === 0) {
    return <EstadoVacio icono={Banknote} mensaje="Todavía no hay movimientos en esta caja." />
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

/**
 * Resumen por tipo para el panel negro (Caja de hoy y Cajas anteriores), donde no cabe la tabla de tres columnas:
 * cada tipo con su total y, debajo, lo que fue en efectivo y en transferencia; al final, los dos totales.
 */
export function ResumenEnLineas({ caja }: { caja: CashSession }) {
  if (!caja.summary) return <p className="registro__nota">El resumen de esta caja no está disponible.</p>
  if (caja.summary.by_kind.length === 0) return <p className="registro__nota">Todavía no hay movimientos en esta caja.</p>
  return (
    <>
      <ul className="registro__lineas" aria-label="Resumen por tipo de movimiento">
        {caja.summary.by_kind.map((fila) => (
          <li key={fila.kind}>
            <span>
              {fila.kind_label}
              <span className="registro__detalle">
                {[fila.cash !== 0 && `Efectivo ${pesosConSigno(fila.cash)}`, fila.transfer !== 0 && `Transferencia ${pesosConSigno(fila.transfer)}`]
                  .filter(Boolean)
                  .join(' · ') || 'Sin valor'}
              </span>
            </span>
            <span className="registro__monto">{pesosConSigno(fila.cash + fila.transfer)}</span>
          </li>
        ))}
      </ul>
      <dl className="registro__datos registro__totales" aria-label="Totales del resumen">
        <div>
          <dt>Total en efectivo</dt>
          <dd>{pesosConSigno(caja.summary.cash_total)}</dd>
        </div>
        <div>
          <dt>Total en transferencias</dt>
          <dd>{pesosConSigno(caja.summary.transfer_total)}</dd>
        </div>
      </dl>
    </>
  )
}

/**
 * Movimientos de una caja, del más reciente al más antiguo. En Caja de hoy (`deHoy`) y en la ventana de una caja
 * anterior (`enVentana`) van de 10 en 10 con el pie de Atrás y Siguiente siempre a la vista.
 */
export function MovimientosDeCaja({ cajaId, deHoy = false, enVentana = false }: { cajaId: number; deHoy?: boolean; enVentana?: boolean }) {
  const [pagina, setPagina] = useState(1)
  const paginado = deHoy || enVentana
  const tamano = paginado ? 10 : 50
  const movimientos = useQuery({
    queryKey: [...claves.caja, 'movimientos', cajaId, pagina, tamano],
    queryFn: ({ signal }) => listarMovimientosDeCaja({ session: cajaId, page: pagina, page_size: paginado ? tamano : undefined }, signal),
    placeholderData: keepPreviousData,
  })
  return (
    <section className="movimientos-caja" aria-label="Movimientos de la caja">
      <header className="movimientos-caja__cabecera">
        <Titulo nivel={3}>Movimientos</Titulo>
        <span className="texto-suave">Más recientes primero</span>
      </header>
      {movimientos.isPending && <Cargando />}
      {movimientos.isError && <ErrorDeCarga error={movimientos.error} onReintentar={() => void movimientos.refetch()} />}
      {movimientos.isSuccess &&
        (movimientos.data.count === 0 ? (
          <EstadoVacio icono={Banknote} mensaje="Todavía no hay movimientos en esta caja." />
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
                    <th scope="col" className="movimientos-caja__secundaria">Medio</th>
                    <th scope="col" className="tabla__numero">
                      Valor
                    </th>
                    <th scope="col" className="movimientos-caja__secundaria">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.data.results.map((m) => (
                    <tr key={m.id}>
                      <td className="tabla__nowrap" title={formatearFechaHora(m.created_at)}>
                        <span className="movimientos-caja__fecha">{formatearFechaHora(m.created_at)}</span>
                        <time className="movimientos-caja__hora" dateTime={m.created_at}>
                          {new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </td>
                      <td title={m.kind_label}>{m.kind_label}</td>
                      <td title={m.reason || '—'}>{m.reason || '—'}</td>
                      <td className="movimientos-caja__secundaria" title={m.method_label}>{m.method_label}</td>
                      <td title={pesosConSigno(m.amount)} className={`tabla__numero ${m.amount > 0 ? 'cantidad--entra' : 'cantidad--sale'}`}>
                        {pesosConSigno(m.amount)}
                      </td>
                      <td className="movimientos-caja__secundaria" title={m.created_by}>{m.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}
      {movimientos.isSuccess && (
        <Paginacion
          etiqueta="Páginas de movimientos de caja"
          pagina={pagina}
          total={movimientos.data.count}
          tamano={tamano}
          hayAnterior={Boolean(movimientos.data.previous)}
          haySiguiente={Boolean(movimientos.data.next)}
          onCambiar={setPagina}
          mostrarSiempre={paginado}
          textoAnterior={paginado ? 'Atrás' : 'Anterior'}
        />
      )}
    </section>
  )
}
