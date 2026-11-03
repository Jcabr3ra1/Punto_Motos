import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client'
import { listarPagosDeLocales, registrarPagoDeLocal } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { ConsigneePaymentInput, PaymentMethod } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { MedioDePago } from '../compras/MedioDePago'
import { SelectorDeLocal } from './SelectorDeLocal'

// Pagos de los locales (solo el dueño): pagan por partes, cada pago baja su saldo y entra a la caja abierta.
export function PagosDeLocales() {
  const [nuevo, setNuevo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [local, setLocal] = useState('')
  const [pagina, setPagina] = useState(1)
  const filtros = { consignee: local ? Number(local) : undefined, page: pagina }
  const pagos = useQuery({
    queryKey: [...claves.consignacion, 'pagos', filtros],
    queryFn: ({ signal }) => listarPagosDeLocales(filtros, signal),
    placeholderData: keepPreviousData,
  })

  if (nuevo) {
    return (
      <>
        <Titulo nivel={2}>Registrar pago de un local</Titulo>
        <FormularioDePago
          onTerminar={(m) => {
            setAviso(m)
            setNuevo(false)
          }}
          onCancelar={() => setNuevo(false)}
        />
      </>
    )
  }

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Pagos de los locales</Titulo>
        <button
          type="button"
          className="boton boton--auto"
          onClick={() => {
            setAviso(null)
            setNuevo(true)
          }}
        >
          Registrar pago
        </button>
      </div>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <div className="filtros">
        <SelectorDeLocal
          etiqueta="Filtrar por local"
          valor={local}
          incluirInactivos
          onCambiar={(v) => {
            setLocal(v)
            setPagina(1)
          }}
        />
      </div>
      {pagos.isPending && <Cargando />}
      {pagos.isError && <ErrorDeCarga error={pagos.error} onReintentar={() => void pagos.refetch()} />}
      {pagos.isSuccess &&
        (pagos.data.count === 0 ? (
          <p className="texto-suave">Todavía no hay pagos.</p>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Pagos de los locales</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Local</th>
                    <th scope="col" className="tabla__numero">
                      Valor
                    </th>
                    <th scope="col">Medio</th>
                    <th scope="col">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.data.results.map((pago) => (
                    <tr key={pago.id}>
                      <td className="tabla__nowrap">{formatearFechaHora(pago.created_at)}</td>
                      <td>{pago.consignee.name}</td>
                      <td className="tabla__numero">{formatearPesos(pago.amount)}</td>
                      <td>{pago.method_label}</td>
                      <td>{pago.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              etiqueta="Páginas de pagos"
              pagina={pagina}
              total={pagos.data.count}
              hayAnterior={Boolean(pagos.data.previous)}
              haySiguiente={Boolean(pagos.data.next)}
              onCambiar={setPagina}
            />
          </>
        ))}
    </>
  )
}

function FormularioDePago({ onTerminar, onCancelar }: { onTerminar: (aviso: string) => void; onCancelar: () => void }) {
  const clienteDeConsultas = useQueryClient()
  const [local, setLocal] = useState('')
  const [valor, setValor] = useState('')
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [notas, setNotas] = useState('')
  const guardar = useMutation({
    mutationFn: () =>
      registrarPagoDeLocal({
        ...(local ? { consignee: Number(local) } : {}),
        ...(valor !== '' ? { amount: Number(valor) } : {}),
        method: medio,
        notes: notas,
      } as ConsigneePaymentInput),
    onSuccess: async (pago) => {
      await Promise.all([claves.consignacion, claves.caja].map((queryKey) => clienteDeConsultas.invalidateQueries({ queryKey })))
      onTerminar(`Pago de ${formatearPesos(pago.amount)} de «${pago.consignee.name}» registrado.`)
    },
    onError: (fallo) => {
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
    },
  })
  const error = guardar.isError ? desglosarError(guardar.error) : null

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <AvisoDeError mensajes={error?.generales ?? []} />
      <SelectorDeLocal valor={local} onCambiar={setLocal} conSaldo incluirInactivos errores={error?.campos.consignee} />
      <Campo
        etiqueta="Valor"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        errores={error?.campos.amount}
        required
      />
      <MedioDePago nombre="medio-pago-local" valor={medio} onCambiar={setMedio} errores={error?.campos.method} />
      <Campo etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} errores={error?.campos.notes} autoComplete="off" />
      <p className="texto-suave">El pago entra a la caja abierta y no se puede editar ni borrar.</p>
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Registrar pago'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
