import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { ReturnCause, ReturnCondition, SaleDetail, SaleReturnDetail, SaleReturnInput } from '../../api/types'
import { nuevaClaveDeReintento, registrarDevolucion } from '../../api/ventas'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Casilla } from '../../components/Casilla'
import { Titulo } from '../../components/Titulo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos } from '../../utilidades/dinero'

type MedioDeReembolso = 'efectivo' | 'transferencia' | 'mixto'

interface EstadoDeLinea {
  cantidad: number
  estado: ReturnCondition | ''
}

interface Props {
  venta: SaleDetail
  esDueno: boolean
  onRegistrada: (devolucion: SaleReturnDetail) => void
  onCancelar: () => void
}

export function FormularioDeDevolucion({ venta, esDueno, onRegistrada, onCancelar }: Props) {
  const clienteDeConsultas = useQueryClient()
  const caja = useCajaActual()
  const [clave] = useState(nuevaClaveDeReintento)
  const [causa, setCausa] = useState<ReturnCause>('other')
  const [motivo, setMotivo] = useState('')
  const [lineas, setLineas] = useState<Record<number, EstadoDeLinea>>(() =>
    Object.fromEntries(venta.items.map((item) => [item.id, { cantidad: 0, estado: '' }])),
  )
  const [serviciosElegidos, setServiciosElegidos] = useState<number[]>([])
  const [medio, setMedio] = useState<MedioDeReembolso>('efectivo')
  const [transferencia, setTransferencia] = useState('')
  const [idsEnviados, setIdsEnviados] = useState<number[]>([])

  const itemsSeleccionados = venta.items
    .map((item) => ({ item, ...(lineas[item.id] ?? { cantidad: 0, estado: '' as const }) }))
    .filter((l) => l.cantidad > 0)

  const totalProductos = itemsSeleccionados.reduce((suma, l) => suma + l.cantidad * l.item.unit_price, 0)
  const totalServicios = venta.services
    .filter((s) => serviciosElegidos.includes(s.id))
    .reduce((suma, s) => suma + s.labor_price, 0)
  const total = totalProductos + totalServicios

  const enTransferencia = medio === 'efectivo' ? 0 : medio === 'mixto' ? Number(transferencia) || 0 : total
  const enEfectivo = Math.max(0, total - enTransferencia)
  const transferenciaNoEntera =
    medio === 'mixto' &&
    transferencia !== '' &&
    (!/^\d+$/.test(transferencia.trim()) || !Number.isSafeInteger(Number(transferencia)))
  const transferenciaDeMas = enTransferencia > total

  const cajaCerrada = caja.data?.is_open === false
  const hayAlgo = itemsSeleccionados.length > 0 || serviciosElegidos.length > 0
  const faltaEstado = itemsSeleccionados.some((l) => l.estado === '')

  const devolver = useMutation({
    mutationFn: () => {
      setIdsEnviados(itemsSeleccionados.map((l) => l.item.id))
      const reembolsos: SaleReturnInput['refunds'] = []
      if (enEfectivo > 0) reembolsos.push({ method: 'cash', amount: enEfectivo })
      if (enTransferencia > 0) reembolsos.push({ method: 'transfer', amount: enTransferencia })
      return registrarDevolucion(venta.id, {
        idempotency_key: clave,
        cause: causa,
        reason: motivo,
        ...(itemsSeleccionados.length > 0
          ? {
              items: itemsSeleccionados.map((l) => ({
                sale_item: l.item.id,
                quantity: l.cantidad,
                condition: l.estado as ReturnCondition,
              })),
            }
          : {}),
        ...(serviciosElegidos.length > 0 ? { services: serviciosElegidos } : {}),
        refunds: reembolsos,
      })
    },
    onSuccess: async (registrada) => {
      await Promise.all(
        [
          claves.ventas,
          claves.devoluciones,
          claves.caja,
          claves.productos,
          claves.movimientos,
          claves.liquidaciones,
          claves.descuentos,
          ['buscador'],
          ['producto'],
        ].map((queryKey) => clienteDeConsultas.invalidateQueries({ queryKey })),
      )
      onRegistrada(registrada)
    },
    onError: (fallo) => {
      if (isApiError(fallo) && fallo.code === 'sale_voided') {
        void clienteDeConsultas.invalidateQueries({ queryKey: [...claves.ventas, 'detalle', venta.id] })
      }
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') {
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
      }
    },
  })

  const error = devolver.isError ? desglosarError(devolver.error) : null
  const erroresDeReembolso = Object.entries(error?.campos ?? {})
    .filter(([campo]) => campo === 'refunds' || campo.startsWith('refunds.'))
    .flatMap(([, lista]) => lista)
  const puedeEnviar =
    !cajaCerrada && hayAlgo && !faltaEstado && !transferenciaDeMas && !transferenciaNoEntera && !devolver.isPending

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (!puedeEnviar) return
    devolver.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate aria-labelledby="titulo-devolver" className="confirmacion terminar">
      <Titulo nivel={3}>
        <span id="titulo-devolver">Devolver de la venta n.º {venta.number}</span>
      </Titulo>
      {cajaCerrada && (
        <p role="status" className="aviso aviso--advertencia">
          La caja está cerrada: el reembolso sale de la caja abierta de hoy.{' '}
          {esDueno ? <Link to="/caja/actual">Abrir la caja</Link> : 'Pídele al dueño que la abra.'}
        </p>
      )}
      <AvisoDeError
        mensajes={[
          ...(error?.generales ?? []),
          ...(error?.campos.items ?? []),
          ...(error?.campos.services ?? []),
          ...erroresDeReembolso,
        ]}
      />

      {venta.items.length > 0 && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Productos para devolver</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Cantidad a devolver</th>
                <th scope="col">Estado del producto</th>
                <th scope="col" className="tabla__numero">
                  Precio cobrado
                </th>
              </tr>
            </thead>
            <tbody>
              {venta.items.map((item) => {
                const disponible = item.quantity - item.returned_quantity
                const actual = lineas[item.id] ?? { cantidad: 0, estado: '' }
                const indiceEnEnvio = idsEnviados.indexOf(item.id)
                const erroresDeLinea =
                  indiceEnEnvio >= 0
                    ? [
                        ...(error?.campos[`items.${indiceEnEnvio}.quantity`] ?? []),
                        ...(error?.campos[`items.${indiceEnEnvio}.condition`] ?? []),
                      ]
                    : []
                return (
                  <tr key={item.id}>
                    <th scope="row">
                      {item.description}
                      {erroresDeLinea.length > 0 && (
                        <ul className="campo__errores">
                          {erroresDeLinea.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </th>
                    <td>
                      {disponible > 0 ? (
                        <>
                          <input
                            type="number"
                            className="celda-numero"
                            aria-label={`Cantidad a devolver de ${item.description}`}
                            min={0}
                            max={disponible}
                            step={1}
                            value={actual.cantidad}
                            onChange={(e) => {
                              const valor = Math.min(Math.max(0, Math.trunc(e.target.valueAsNumber) || 0), disponible)
                              setLineas((prev) => ({
                                ...prev,
                                [item.id]: { ...actual, cantidad: valor, estado: valor === 0 ? '' : actual.estado },
                              }))
                            }}
                          />
                          <span className="tabla__detalle">de {disponible}</span>
                        </>
                      ) : (
                        <span className="texto-suave">Ya devuelto</span>
                      )}
                    </td>
                    <td>
                      {actual.cantidad > 0 ? (
                        <select
                          className="celda-selector"
                          aria-label={`Estado de ${item.description}`}
                          value={actual.estado}
                          onChange={(e) =>
                            setLineas((prev) => ({
                              ...prev,
                              [item.id]: { ...actual, estado: e.target.value as ReturnCondition | '' },
                            }))
                          }
                        >
                          <option value="">Elige el estado</option>
                          <option value="resellable">Vuelve al inventario</option>
                          <option value="damaged">No puede volver</option>
                        </select>
                      ) : (
                        <span className="texto-suave">—</span>
                      )}
                    </td>
                    <td className="tabla__numero">{formatearPesos(item.unit_price)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {venta.services.length > 0 && (
        <fieldset className="conjunto">
          <legend>Servicios para devolver</legend>
          {venta.services.map((servicio) => {
            const etiqueta = `Devolver servicio ${servicio.service_type.code} · ${servicio.service_type.name}`
            return (
              <div key={servicio.id}>
                <Casilla
                  etiqueta={`${etiqueta} (${servicio.mechanic.name} · ${formatearPesos(servicio.labor_price)})${servicio.is_returned ? ' — Ya devuelto' : ''}`}
                  aria-label={etiqueta}
                  disabled={servicio.is_returned}
                  checked={serviciosElegidos.includes(servicio.id)}
                  onChange={(e) =>
                    setServiciosElegidos((prev) =>
                      e.target.checked ? [...prev, servicio.id] : prev.filter((id) => id !== servicio.id),
                    )
                  }
                />
              </div>
            )
          })}
        </fieldset>
      )}

      <CampoSelector
        etiqueta="Causa"
        value={causa}
        onChange={(e) => setCausa(e.target.value as ReturnCause)}
        errores={error?.campos.cause}
        opciones={[
          { valor: 'other', texto: 'Otra causa (la asume el local)' },
          ...(esDueno ? [{ valor: 'bad_service', texto: 'Mal servicio del mecánico' }] : []),
        ]}
      />
      <Campo
        etiqueta="Motivo de la devolución"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={150}
        errores={error?.campos.reason}
        ayuda="Obligatorio. Por ejemplo: «Quedó botando aceite» o «No le sirvió la referencia»."
        autoComplete="off"
      />

      <p>
        Total a reembolsar: <strong>{formatearPesos(total)}</strong>
      </p>

      <fieldset className="conjunto">
        <legend>Medio de reembolso</legend>
        <div className="opciones-en-fila">
          {(
            [
              { valor: 'efectivo', texto: 'Efectivo' },
              { valor: 'transferencia', texto: 'Transferencia' },
              { valor: 'mixto', texto: 'Mixto' },
            ] as const
          ).map((opcion) => (
            <label key={opcion.valor} className="opcion">
              <input
                type="radio"
                name="medio-reembolso"
                checked={medio === opcion.valor}
                onChange={() => setMedio(opcion.valor)}
              />
              {opcion.texto}
            </label>
          ))}
        </div>
      </fieldset>

      {medio === 'mixto' && (
        <Campo
          etiqueta="Reembolso por transferencia"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={transferencia}
          onChange={(e) => setTransferencia(e.target.value)}
          errores={
            transferenciaNoEntera
              ? ['Escribe un monto entero en pesos.']
              : transferenciaDeMas
                ? ['No puede superar el total a reembolsar.']
                : undefined
          }
          ayuda={`El resto (${formatearPesos(enEfectivo)}) se reembolsa en efectivo.`}
        />
      )}

      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={!puedeEnviar}>
          {devolver.isPending ? 'Registrando…' : `Registrar devolución (${formatearPesos(total)})`}
        </button>
        <button
          type="button"
          className="boton boton--secundario boton--auto"
          disabled={devolver.isPending}
          onClick={onCancelar}
        >
          Volver
        </button>
      </div>
    </form>
  )
}
