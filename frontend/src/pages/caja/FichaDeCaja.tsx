import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { obtenerCaja } from '../../api/caja'
import { claves } from '../../api/consultas'
import type { CashSession } from '../../api/types'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Registro } from '../../components/Registro'
import { Titulo } from '../../components/Titulo'
import { VentanaDeDocumento } from '../../components/VentanaDeDocumento'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { cuadreDeCaja } from './cuadreDeCaja'
import { CifrasDeCaja, MovimientosDeCaja, ResumenEnLineas, ResumenPorTipo } from './ResumenDeCaja'

const consultaDeCaja = (id: number) => ({
  queryKey: [...claves.caja, 'detalle', id],
  queryFn: ({ signal }: { signal: AbortSignal }) => obtenerCaja(id, signal),
})

/** Una caja anterior en el registro negro: el efectivo esperado, si cuadró, quién la abrió y cerró y su resumen. */
export function FichaDeCaja({ id, abierta, onCerrar }: { id: number; abierta: string; onCerrar: () => void }) {
  const caja = useQuery(consultaDeCaja(id))
  const datos = caja.data
  const [viendoCaja, setViendoCaja] = useState(false)
  return (
    <>
      <Registro
        titulo={`Caja del ${formatearFechaHora(abierta)}`}
        modulo="Cajas anteriores"
        onCerrar={onCerrar}
        acciones={
          <button type="button" className="boton" onClick={() => setViendoCaja(true)} disabled={!datos}>
            Abrir la caja
          </button>
        }
      >
        {caja.isPending && <p className="registro__nota">Cargando la caja…</p>}
        {caja.isError && <p className="registro__nota">No se pudo cargar la caja.</p>}
        {datos && (
          <>
            <p className="registro__cifra">
              <span className="registro__total">{formatearPesos(datos.expected_cash)}</span>
              <span className="registro__detalle">
                Efectivo esperado ·{' '}
                <span className={datos.difference ? 'registro__alerta' : undefined}>{cuadreDeCaja(datos)}</span>
              </span>
            </p>
            <dl className="registro__datos">
              <div>
                <dt>Efectivo inicial</dt>
                <dd>{formatearPesos(datos.opening_cash)}</dd>
              </div>
              <div>
                <dt>Contado</dt>
                <dd>{datos.counted_cash === null ? '—' : formatearPesos(datos.counted_cash)}</dd>
              </div>
              {datos.summary && (
                <div>
                  <dt>Transferencias</dt>
                  <dd>{formatearPesos(datos.summary.transfer_total)}</dd>
                </div>
              )}
              <div>
                <dt>Abrió</dt>
                <dd>{datos.opened_by}</dd>
              </div>
              <div>
                <dt>Cerró</dt>
                <dd>
                  {datos.closed_by ?? '—'}
                  {datos.closed_at && <span className="registro__detalle">{formatearFechaHora(datos.closed_at)}</span>}
                </dd>
              </div>
              {datos.closing_notes && (
                <div>
                  <dt>{datos.difference ? 'Explicación de la diferencia' : 'Nota del cierre'}</dt>
                  <dd>{datos.closing_notes}</dd>
                </div>
              )}
            </dl>
            {datos.summary && datos.summary.by_kind.length > 0 && (
              <>
                <h4 className="registro__subtitulo">Resumen</h4>
                <ResumenEnLineas caja={datos} />
              </>
            )}
          </>
        )}
      </Registro>
      {viendoCaja && <VentanaDeCaja id={id} abierta={abierta} onCerrar={() => setViendoCaja(false)} />}
    </>
  )
}

/** Una caja anterior completa (cifras, resumen y movimientos) en una ventana emergente, sin salir de la lista. */
export function VentanaDeCaja({ id, abierta, onCerrar }: { id: number; abierta: string; onCerrar: () => void }) {
  const caja = useQuery(consultaDeCaja(id))
  return (
    <VentanaDeDocumento titulo={`Caja del ${formatearFechaHora(abierta)}`} onCerrar={onCerrar}>
      {caja.isPending && <Cargando />}
      {caja.isError && <ErrorDeCarga error={caja.error} onReintentar={() => void caja.refetch()} />}
      {caja.data && <DocumentoDeCaja caja={caja.data} />}
    </VentanaDeDocumento>
  )
}

/** Lo que se ve de una caja anterior: quién la abrió y cerró, sus cifras, el resumen por tipo y los movimientos. */
export function DocumentoDeCaja({ caja }: { caja: CashSession }) {
  return (
    <article className="documento-de-caja" aria-label={`Caja del ${formatearFechaHora(caja.opened_at)}`}>
      <p className="texto-suave">
        Abrió {caja.opened_by}
        {caja.closed_at && ` · Cerró ${caja.closed_by} el ${formatearFechaHora(caja.closed_at)}`}
        {caja.closing_notes && ` · ${caja.closing_notes}`}
      </p>
      <CifrasDeCaja caja={caja} />
      <Titulo nivel={3}>Resumen</Titulo>
      <ResumenPorTipo caja={caja} />
      <MovimientosDeCaja cajaId={caja.id} enVentana />
    </article>
  )
}
