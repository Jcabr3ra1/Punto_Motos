import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { consultarLiquidacionDelDia, listarDescuentosDeMecanicos, pagarAMecanico } from '../../api/taller'
import type { MechanicSettlementDetail, PaymentMethod, SettlementPreviewRow } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos } from '../../utilidades/dinero'
import { hoyEnColombia } from '../../utilidades/fechas'
import { MedioDePago } from '../compras/MedioDePago'
import { HojaDeLiquidacion } from './HojaDeLiquidacion'

const TAMANO_DE_PAGINA = 50

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

  return (
    <>
      <Titulo nivel={2}>Liquidación del día</Titulo>
      <p className="texto-suave">
        A cada mecánico se le paga su porcentaje de la mano de obra; los repuestos son del local. Cada servicio se paga una sola vez.
      </p>
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
      <AvisoDeError mensajes={error?.generales ?? []} />
      <div className="filtros">
        <Campo
          etiqueta="Día a liquidar"
          type="date"
          max={hoyEnColombia()}
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value)
            setPagando(null)
            setHoja(null)
            setAviso(null)
          }}
          errores={error?.campos.date}
        />
      </div>

      {hoja && <HojaDeLiquidacion liquidacion={hoja} />}

      {dia.isPending && fecha !== '' && <Cargando />}
      {dia.isError && <ErrorDeCarga error={dia.error} onReintentar={() => void dia.refetch()} />}
      {dia.isSuccess &&
        (dia.data.mechanics.length === 0 ? (
          <p className="texto-suave">No hay servicios sin pagar ese día.</p>
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
                {dia.data.mechanics.map((fila) => (
                  <tr key={fila.mechanic.id}>
                    <th scope="row">{fila.mechanic.name}</th>
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
                        onClick={() => {
                          pagar.reset()
                          setMedio('cash')
                          setPagando(fila)
                        }}
                      >
                        Pagar…
                      </button>
                    </td>
                  </tr>
                ))}
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

      {pagando && (
        <div role="group" aria-labelledby="titulo-pagar" className="confirmacion terminar">
          <Titulo nivel={3}>
            <span id="titulo-pagar">
              ¿Pagarle {formatearPesos(pagando.amount)} a {pagando.mechanic.name}?
            </span>
          </Titulo>
          <p>
            Son {pagando.services_count === 1 ? '1 servicio' : `${pagando.services_count} servicios`} con{' '}
            {formatearPesos(pagando.labor_total)} de mano de obra, al {pagando.percentage} %.
            {pagando.deductions_total > 0
              ? ` Su parte es ${formatearPesos(pagando.share)} y se le descuentan ${formatearPesos(pagando.deductions_total)} por mal servicio.`
              : ' El dinero sale de la caja abierta de hoy.'}
          </p>
          <MedioDePago nombre="medio-liquidacion" valor={medio} onCambiar={setMedio} errores={error?.campos.method} />
          <div className="acciones">
            <button type="button" className="boton boton--auto" disabled={pagar.isPending} onClick={() => pagar.mutate(pagando)}>
              {pagar.isPending ? 'Pagando…' : 'Sí, pagar'}
            </button>
            <button type="button" className="boton boton--secundario boton--auto" onClick={() => setPagando(null)} autoFocus>
              Volver
            </button>
          </div>
        </div>
      )}

      {(descuentosPendientes.isError || (descuentosPendientes.data && descuentosPendientes.data.results.length > 0)) && (
        <section aria-label="Saldos pendientes por descontar" className="terminar">
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
                        <td>
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
    </>
  )
}
