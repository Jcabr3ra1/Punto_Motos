import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { consultarLiquidacionDelDia, listarDescuentosDeMecanicos, pagarAMecanico } from '../../api/taller'
import type { MechanicSettlementDetail, PaymentMethod, SettlementPreviewRow } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BarraDeFiltros, BotonDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Titulo } from '../../components/Titulo'
import { VentanaDeDocumento } from '../../components/VentanaDeDocumento'
import { useCajaActual } from '../../hooks/useCajaActual'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { hoyEnColombia, moverDia } from '../../utilidades/fechas'
import { MedioDePago } from '../compras/MedioDePago'
import { HojaDeLiquidacion } from './HojaDeLiquidacion'

const TAMANO_DE_PAGINA = 50

function resumirServicios(servicios: SettlementPreviewRow['services']): string {
  if (!servicios || servicios.length === 0) return ''
  const conteos = new Map<string, number>()
  for (const s of servicios) {
    conteos.set(s.service_type.name, (conteos.get(s.service_type.name) ?? 0) + 1)
  }
  return Array.from(conteos.entries())
    .map(([nombre, n]) => (n > 1 ? `${nombre} (×${n})` : nombre))
    .join(' · ')
}

// Liquidación del día (solo el dueño): a cada mecánico se le paga su porcentaje de la mano de obra de los
// servicios sin pagar de ese día. El dinero sale de la caja abierta de hoy, aunque el día sea anterior.
export function LiquidacionDelDia() {
  const clienteDeConsultas = useQueryClient()
  const [fecha, setFecha] = useState(hoyEnColombia)
  const [pagando, setPagando] = useState<SettlementPreviewRow | null>(null)
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [hoja, setHoja] = useState<MechanicSettlementDetail | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [paginaDescuentos, setPaginaDescuentos] = useState(1)
  const botonVolver = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (pagando) botonVolver.current?.focus()
  }, [pagando])
  const caja = useCajaActual()
  const claveDelDia = [...claves.liquidaciones, 'dia', fecha]
  const dia = useQuery({ queryKey: claveDelDia, queryFn: ({ signal }) => consultarLiquidacionDelDia(fecha, signal), enabled: fecha !== '' })
  const descuentosPendientes = useQuery({
    queryKey: [...claves.descuentos, 'pendientes', paginaDescuentos],
    queryFn: ({ signal }) => listarDescuentosDeMecanicos({ pending: true, page: paginaDescuentos }, signal),
    placeholderData: keepPreviousData,
  })

  const pagar = useMutation({
    mutationFn: (fila: SettlementPreviewRow) => pagarAMecanico({ mechanic: fila.mechanic.id, date: fecha, method: medio }),
    onSuccess: async (liquidacion) => {
      setPagando(null)
      setHoja(liquidacion)
      setAviso(
        liquidacion.amount === 0 && liquidacion.deductions_total > 0
          ? `Liquidación de ${liquidacion.mechanic.name} registrada: se descontaron ${formatearPesos(liquidacion.deductions_total)} ($0 a pagar).`
          : `Se le pagaron ${formatearPesos(liquidacion.amount)} a ${liquidacion.mechanic.name}.`,
      )
      await Promise.all(
        [claves.liquidaciones, claves.descuentos, claves.caja, claves.ventas].map((queryKey) =>
          clienteDeConsultas.invalidateQueries({ queryKey }),
        ),
      )
    },
    onError: (fallo) => {
      // Un doble clic o algo ya pagado: se vuelve a cargar la vista previa. Sin caja: se vuelve a consultar.
      if (isApiError(fallo) && fallo.code === 'nothing_to_settle') {
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.liquidaciones })
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.descuentos })
      }
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
    },
  })
  const error = pagar.isError ? desglosarError(pagar.error) : null
  const cajaCerrada = caja.data?.is_open === false

  const ayer = moverDia(hoyEnColombia(), -1)
  const serviciosDelDia = dia.data?.mechanics.reduce((suma, fila) => suma + fila.services_count, 0) ?? 0

  function cambiarDia(valor: string) {
    setFecha(valor)
    setPagando(null)
    setHoja(null)
    setAviso(null)
  }

  return (
    <div className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.liquidacion.icono}
        titulo="Liquidación del día"
        descripcion="A cada mecánico se le paga su porcentaje de la mano de obra. Cada servicio se paga una sola vez."
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Total por pagar', valor: formatearPesos(dia.data?.total ?? 0), cargando: dia.isPending && fecha !== '', error: dia.isError },
          { rotulo: 'Mecánicos con pendiente', valor: String(dia.data?.mechanics.length ?? 0), cargando: dia.isPending && fecha !== '', error: dia.isError },
          { rotulo: 'Servicios', valor: String(serviciosDelDia), cargando: dia.isPending && fecha !== '', error: dia.isError },
        ]}
      />
      {cajaCerrada && (
        <p role="status" className="aviso aviso--advertencia">
          La caja está cerrada: el pago sale de la caja abierta de hoy. <Link to="/caja/actual">Abrir la caja</Link>
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <AvisoDeError mensajes={[...(error?.generales ?? []), ...(error?.campos.date ?? [])]} />
      <BarraDeFiltros>
        <div className="barra-de-filtros__grupo" role="group" aria-label="Día">
          <BotonDeFiltro activo={fecha === hoyEnColombia()} onClick={() => cambiarDia(hoyEnColombia())}>
            Hoy
          </BotonDeFiltro>
          <BotonDeFiltro activo={fecha === ayer} onClick={() => cambiarDia(ayer)}>
            Ayer
          </BotonDeFiltro>
          <label className="filtro-fecha">
            Día a liquidar
            <input type="date" max={hoyEnColombia()} value={fecha} onChange={(e) => cambiarDia(e.target.value)} />
          </label>
        </div>
      </BarraDeFiltros>

      <div className="libro">
        <section className="libro__lista libro__lista--desplazable" aria-label="Por pagar">
          {hoja && <HojaDeLiquidacion liquidacion={hoja} />}

          {dia.isPending && fecha !== '' && <Cargando />}
          {dia.isError && <ErrorDeCarga error={dia.error} onReintentar={() => void dia.refetch()} />}
          {dia.isSuccess &&
            (dia.data.mechanics.length === 0 ? (
              <EstadoVacio icono={DESTINOS.liquidacion.icono} mensaje="No hay servicios sin pagar ese día." />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Lo que se le debe a cada mecánico</caption>
                  <thead>
                    <tr>
                      <th scope="col">Mecánico</th>
                      <th scope="col" className="tabla__numero">
                        Servicios
                      </th>
                      <th scope="col" className="tabla__numero">
                        Mano de obra
                      </th>
                      <th scope="col" className="tabla__numero">
                        Porcentaje
                      </th>
                      <th scope="col" className="tabla__numero">
                        A pagar
                      </th>
                      <th scope="col">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dia.data.mechanics.map((fila) => {
                      const resumen = resumirServicios(fila.services)
                      const abrirVentana = () => {
                        pagar.reset()
                        setMedio('cash')
                        setPagando(fila)
                      }
                      return (
                        <tr
                          key={fila.mechanic.id}
                          className="tabla__fila--elegible"
                          aria-selected={pagando?.mechanic.id === fila.mechanic.id}
                          onClick={abrirVentana}
                        >
                          <th scope="row">
                            {fila.mechanic.name}
                            {resumen && <span className="tabla__detalle">{resumen}</span>}
                          </th>
                          <td className="tabla__numero">{fila.services_count}</td>
                          <td className="tabla__numero">{formatearPesos(fila.labor_total)}</td>
                          <td className="tabla__numero">{fila.percentage} %</td>
                          <td className="tabla__numero">
                            <strong>{formatearPesos(fila.amount)}</strong>
                            {fila.deductions_total > 0 && (
                              <span className="tabla__detalle">
                                Su parte {formatearPesos(fila.share)} − descuento {formatearPesos(fila.deductions_total)}
                              </span>
                            )}
                          </td>
                          <td className="tabla__acciones">
                            <button
                              type="button"
                              className="boton boton--auto"
                              disabled={cajaCerrada || pagar.isPending}
                              aria-label={`Pagar a ${fila.mechanic.name}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                abrirVentana()
                              }}
                            >
                              Pagar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={4}>
                        Total que saldría de la caja
                      </th>
                      <td className="tabla__numero">
                        <strong>{formatearPesos(dia.data.total)}</strong>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))}

          {(descuentosPendientes.isError || (descuentosPendientes.data && descuentosPendientes.data.results.length > 0)) && (
            <section aria-label="Saldos pendientes por descontar" className="liquidacion__saldos">
              <Titulo nivel={3}>Saldos pendientes por descontar</Titulo>
              <p className="texto-suave">
                Se restan automáticamente en las próximas liquidaciones de cada mecánico, los más antiguos primero.
              </p>
              {descuentosPendientes.isError && (
                <ErrorDeCarga error={descuentosPendientes.error} onReintentar={() => void descuentosPendientes.refetch()} />
              )}
              {descuentosPendientes.data && descuentosPendientes.data.results.length > 0 && (
                <>
                  <div className="tabla-contenedor">
                    <table className="tabla">
                      <caption className="solo-lectores">Descuentos pendientes de mecánicos</caption>
                      <thead>
                        <tr>
                          <th scope="col">Mecánico</th>
                          <th scope="col">Devolución y motivo</th>
                          <th scope="col" className="tabla__numero">
                            Descuento total
                          </th>
                          <th scope="col" className="tabla__numero">
                            Falta por descontar
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {descuentosPendientes.data.results.map((d) => (
                          <tr key={d.id}>
                            <th scope="row">{d.mechanic.name}</th>
                            <td className="libro__recortado" title={d.reason}>
                              Devolución n.º {d.sale_return_number} · Venta n.º {d.sale_number} · {d.customer || 'Sin cliente'}
                              {d.services.length > 0 && (
                                <span className="tabla__detalle">
                                  {d.services.map((s) => `${s.service_type.code} · ${s.service_type.name}`).join(', ')}
                                </span>
                              )}
                              <span className="tabla__detalle">{d.reason}</span>
                            </td>
                            <td className="tabla__numero">{formatearPesos(d.amount)}</td>
                            <td className="tabla__numero">
                              <strong>{formatearPesos(d.pending_amount)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Paginacion
                    etiqueta="Páginas de saldos pendientes"
                    pagina={paginaDescuentos}
                    total={descuentosPendientes.data.count}
                    tamano={TAMANO_DE_PAGINA}
                    hayAnterior={Boolean(descuentosPendientes.data.previous)}
                    haySiguiente={Boolean(descuentosPendientes.data.next)}
                    onCambiar={setPaginaDescuentos}
                  />
                </>
              )}
            </section>
          )}
        </section>

        {/* Resumen del día en el panel negro; al elegir un mecánico se despliega la ventana interactiva. */}
        <aside className="registro" aria-label="Pago al mecánico">
          <div className="registro__cuerpo">
            <p className="registro__titulo">Total que saldría de la caja</p>
            <p className="registro__cifra">
              <span className="registro__total">{formatearPesos(dia.data?.total ?? 0)}</span>
            </p>
            <p className="registro__nota">
              {dia.data && dia.data.mechanics.length > 0
                ? `${dia.data.mechanics.length === 1 ? '1 mecánico' : `${dia.data.mechanics.length} mecánicos`} · ${serviciosDelDia === 1 ? '1 servicio' : `${serviciosDelDia} servicios`}. Elige un mecánico o pulsa «Pagar» para revisar sus servicios y liquidar.`
                : 'Nada por pagar ese día.'}
            </p>
            {cajaCerrada && <p className="registro__alerta">La caja está cerrada: ábrela para poder pagar.</p>}
          </div>
        </aside>
      </div>

      {pagando && (
        <VentanaDeDocumento titulo={`Liquidación de ${pagando.mechanic.name}`} onCerrar={() => setPagando(null)}>
          <div role="group" aria-labelledby="titulo-pagar" className="liquidacion-ventana">
            <h3 id="titulo-pagar" className="solo-lectores">
              ¿Pagarle {formatearPesos(pagando.amount)} a {pagando.mechanic.name}?
            </h3>
            <p className="texto-suave">
              Son {pagando.services_count === 1 ? '1 servicio' : `${pagando.services_count} servicios`} con{' '}
              {formatearPesos(pagando.labor_total)} de mano de obra, al {pagando.percentage} %.
              {pagando.deductions_total > 0
                ? ` Su parte es ${formatearPesos(pagando.share)} y se le descuentan ${formatearPesos(pagando.deductions_total)} por mal servicio.`
                : ' El dinero sale de la caja abierta de hoy.'}
            </p>

            {pagando.services && pagando.services.length > 0 && (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Servicios realizados por {pagando.mechanic.name}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Venta</th>
                      <th scope="col">Servicio</th>
                      <th scope="col">Cliente</th>
                      <th scope="col" className="tabla__numero">Mano de obra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagando.services.map((s) => (
                      <tr key={s.id}>
                        <td>N.º {s.sale_number}</td>
                        <th scope="row">
                          {s.service_type.code} · {s.service_type.name}
                          {s.details && <span className="tabla__detalle">{s.details}</span>}
                        </th>
                        <td>{s.customer || 'Sin cliente'}</td>
                        <td className="tabla__numero">{formatearPesos(s.labor_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <dl className="avance">
              <div>
                <dt>Mano de obra</dt>
                <dd>{formatearPesos(pagando.labor_total)}</dd>
              </div>
              <div>
                <dt>Su parte ({pagando.percentage} %)</dt>
                <dd>{formatearPesos(pagando.share)}</dd>
              </div>
              {pagando.deductions_total > 0 && (
                <div>
                  <dt>Descuento por mal servicio</dt>
                  <dd className="cantidad--sale">−{formatearPesos(pagando.deductions_total)}</dd>
                </div>
              )}
              <div className="avance__destacado">
                <dt>Total a pagar</dt>
                <dd>{formatearPesos(pagando.amount)}</dd>
              </div>
            </dl>

            {cajaCerrada ? (
              <p role="status" className="aviso aviso--advertencia">
                La caja está cerrada: abre la caja de hoy para registrar el pago. <Link to="/caja/actual">Abrir la caja</Link>
              </p>
            ) : (
              <MedioDePago nombre="medio-liquidacion" valor={medio} onCambiar={setMedio} errores={error?.campos.method} />
            )}

            <div className="acciones">
              <button
                type="button"
                className="boton boton--auto"
                disabled={cajaCerrada || pagar.isPending}
                onClick={() => pagar.mutate(pagando)}
              >
                {pagar.isPending ? 'Pagando…' : `Sí, pagar ${formatearPesos(pagando.amount)}`}
              </button>
              <button ref={botonVolver} type="button" className="boton boton--secundario boton--auto" onClick={() => setPagando(null)}>
                Volver
              </button>
            </div>
          </div>
        </VentanaDeDocumento>
      )}
    </div>
  )
}
