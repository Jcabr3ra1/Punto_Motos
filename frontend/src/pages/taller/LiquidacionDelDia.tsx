import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { consultarLiquidacionDelDia, pagarAMecanico } from '../../api/taller'
import type { MechanicSettlementDetail, PaymentMethod, SettlementPreviewRow } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos } from '../../utilidades/dinero'
import { hoyEnColombia } from '../../utilidades/fechas'
import { MedioDePago } from '../compras/MedioDePago'
import { HojaDeLiquidacion } from './HojaDeLiquidacion'

// Liquidación del día (solo el dueño): a cada mecánico se le paga su porcentaje de la mano de obra de los
// servicios sin pagar de ese día. El dinero sale de la caja abierta de hoy, aunque el día sea anterior.
export function LiquidacionDelDia() {
  const clienteDeConsultas = useQueryClient()
  const [fecha, setFecha] = useState(hoyEnColombia)
  const [pagando, setPagando] = useState<SettlementPreviewRow | null>(null)
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [hoja, setHoja] = useState<MechanicSettlementDetail | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const caja = useCajaActual()
  const claveDelDia = [...claves.liquidaciones, 'dia', fecha]
  const dia = useQuery({ queryKey: claveDelDia, queryFn: ({ signal }) => consultarLiquidacionDelDia(fecha, signal), enabled: fecha !== '' })

  const pagar = useMutation({
    mutationFn: (fila: SettlementPreviewRow) => pagarAMecanico({ mechanic: fila.mechanic.id, date: fecha, method: medio }),
    onSuccess: async (liquidacion) => {
      setPagando(null)
      setHoja(liquidacion)
      setAviso(`Se le pagaron ${formatearPesos(liquidacion.amount)} a ${liquidacion.mechanic.name}.`)
      await Promise.all([claves.liquidaciones, claves.caja, claves.ventas].map((queryKey) => clienteDeConsultas.invalidateQueries({ queryKey })))
    },
    onError: (fallo) => {
      // Un doble clic o algo ya pagado: se vuelve a cargar la vista previa. Sin caja: se vuelve a consultar.
      if (isApiError(fallo) && fallo.code === 'nothing_to_settle') void clienteDeConsultas.invalidateQueries({ queryKey: claves.liquidaciones })
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
            {formatearPesos(pagando.labor_total)} de mano de obra, al {pagando.percentage} %. El dinero sale de la caja abierta de hoy.
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
    </>
  )
}
