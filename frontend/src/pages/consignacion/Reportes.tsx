import { ClipboardCheck } from 'lucide-react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { listarReportes, pendientesDeLocal, registrarReporte } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { ConsignmentReportInput } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { SelectorDeLocal } from './SelectorDeLocal'

// Reportes de los locales (solo el dueño): cuántas unidades vendieron (suben su saldo al valor pactado) y
// cuántas devolvieron (vuelven al inventario). No se editan ni se borran.
export function Reportes() {
  const [nuevo, setNuevo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [local, setLocal] = useState('')
  const [pagina, setPagina] = useState(1)
  const filtros = { consignee: local ? Number(local) : undefined, page: pagina }
  const reportes = useQuery({
    queryKey: [...claves.consignacion, 'reportes', filtros],
    queryFn: ({ signal }) => listarReportes(filtros, signal),
    placeholderData: keepPreviousData,
  })

  if (nuevo) {
    return (
      <>
        <Titulo nivel={2}>Nuevo reporte</Titulo>
        <FormularioDeReporte
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
        <Titulo nivel={2}>Reportes</Titulo>
        <button
          type="button"
          className="boton boton--auto"
          onClick={() => {
            setAviso(null)
            setNuevo(true)
          }}
        >
          <ClipboardCheck aria-hidden="true" size={16} />
          Nuevo reporte
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
      {reportes.isPending && <Cargando />}
      {reportes.isError && <ErrorDeCarga error={reportes.error} onReintentar={() => void reportes.refetch()} />}
      {reportes.isSuccess &&
        (reportes.data.count === 0 ? (
          <p className="texto-suave">Todavía no hay reportes.</p>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Reportes de los locales</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Local</th>
                    <th scope="col">Vendido y devuelto</th>
                    <th scope="col" className="tabla__numero">
                      Sube el saldo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportes.data.results.map((reporte) => (
                    <tr key={reporte.id}>
                      <td className="tabla__nowrap">{formatearFechaHora(reporte.created_at)}</td>
                      <td>{reporte.consignee.name}</td>
                      <td>
                        {reporte.lines.map((l) => (
                          <span key={l.item} className="tabla__detalle">
                            {l.product.name}: vendió {l.sold}, devolvió {l.returned}
                          </span>
                        ))}
                      </td>
                      <td className="tabla__numero">{formatearPesos(reporte.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              etiqueta="Páginas de reportes"
              pagina={pagina}
              total={reportes.data.count}
              hayAnterior={Boolean(reportes.data.previous)}
              haySiguiente={Boolean(reportes.data.next)}
              onCambiar={setPagina}
            />
          </>
        ))}
    </>
  )
}

function FormularioDeReporte({ onTerminar, onCancelar }: { onTerminar: (aviso: string) => void; onCancelar: () => void }) {
  const clienteDeConsultas = useQueryClient()
  const [local, setLocal] = useState('')
  const [cantidades, setCantidades] = useState<Record<number, { vendidas: string; devueltas: string }>>({})
  const [notas, setNotas] = useState('')
  // El reporte se arma con lo que el local todavía tiene.
  const pendientes = useQuery({
    queryKey: [...claves.consignacion, 'pendientes', Number(local)],
    queryFn: ({ signal }) => pendientesDeLocal(Number(local), signal),
    enabled: local !== '',
  })

  const guardar = useMutation({
    mutationFn: () => {
      const items = pendientes.data ?? []
      const lineas = items
        .map((item) => ({ item: item.id, c: cantidades[item.id] }))
        .filter(({ c }) => c && (c.vendidas !== '' || c.devueltas !== ''))
        .map(({ item, c }) => ({
          item,
          ...(c.vendidas !== '' ? { sold: Number(c.vendidas) } : {}),
          ...(c.devueltas !== '' ? { returned: Number(c.devueltas) } : {}),
        }))
      return registrarReporte({ ...(local ? { consignee: Number(local) } : {}), lines: lineas, notes: notas } as ConsignmentReportInput)
    },
    onSuccess: async (reporte) => {
      await Promise.all(
        [claves.consignacion, claves.productos, claves.movimientos, ['buscador'], ['producto']].map((queryKey) =>
          clienteDeConsultas.invalidateQueries({ queryKey }),
        ),
      )
      onTerminar(`Reporte de «${reporte.consignee.name}» registrado: su saldo sube ${formatearPesos(reporte.total)}.`)
    },
  })
  const error = guardar.isError ? desglosarError(guardar.error) : null
  // Los errores de línea llegan por la posición de las líneas enviadas, no por la de la tabla.
  const enviados = (pendientes.data ?? []).filter((item) => {
    const c = cantidades[item.id]
    return c && (c.vendidas !== '' || c.devueltas !== '')
  })
  const erroresDe = (itemId: number) => {
    const posicion = enviados.findIndex((item) => item.id === itemId)
    if (posicion < 0 || !error) return []
    return ['item', 'sold', 'returned'].flatMap((campo) => error.campos[`lines.${posicion}.${campo}`] ?? [])
  }
  const total = (pendientes.data ?? []).reduce((s, item) => s + (Number(cantidades[item.id]?.vendidas) || 0) * item.unit_value, 0)

  function cambiar(itemId: number, campo: 'vendidas' | 'devueltas', valor: string) {
    setCantidades((a) => ({ ...a, [itemId]: { ...(a[itemId] ?? { vendidas: '', devueltas: '' }), [campo]: valor } }))
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario formulario--ancho">
      <AvisoDeError mensajes={[...(error?.generales ?? []), ...(error?.campos.lines ?? [])]} />
      <SelectorDeLocal
        valor={local}
        incluirInactivos
        onCambiar={(v) => {
          setLocal(v)
          setCantidades({})
        }}
        errores={error?.campos.consignee}
      />
      {local !== '' && pendientes.isPending && <Cargando />}
      {pendientes.isError && <ErrorDeCarga error={pendientes.error} onReintentar={() => void pendientes.refetch()} />}
      {pendientes.isSuccess &&
        (pendientes.data.length === 0 ? (
          <p className="texto-suave">Este local no tiene mercancía pendiente: no hay nada que reportar.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Lo que el local tiene, para reportar</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" className="tabla__numero">
                    Tiene
                  </th>
                  <th scope="col" className="tabla__numero">
                    Valor pactado
                  </th>
                  <th scope="col">Vendidas</th>
                  <th scope="col">Devueltas</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.data.map((item) => {
                  const errores = erroresDe(item.id)
                  return (
                    <tr key={item.id}>
                      <th scope="row">
                        {item.product.name}
                        <span className="tabla__detalle">Entregado el {formatearFechaHora(item.delivered_at)}</span>
                        {errores.length > 0 && (
                          <ul className="campo__errores">
                            {errores.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        )}
                      </th>
                      <td className="tabla__numero">{item.pending_quantity}</td>
                      <td className="tabla__numero">{formatearPesos(item.unit_value)}</td>
                      <td>
                        <input
                          type="number"
                          className="celda-numero"
                          aria-label={`Vendidas de ${item.product.name} (entrega ${item.delivery})`}
                          min={0}
                          max={item.pending_quantity}
                          step={1}
                          value={cantidades[item.id]?.vendidas ?? ''}
                          onChange={(e) => cambiar(item.id, 'vendidas', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="celda-numero"
                          aria-label={`Devueltas de ${item.product.name} (entrega ${item.delivery})`}
                          min={0}
                          max={item.pending_quantity}
                          step={1}
                          value={cantidades[item.id]?.devueltas ?? ''}
                          onChange={(e) => cambiar(item.id, 'devueltas', e.target.value)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={4}>
                    Sube el saldo del local (orientativo)
                  </th>
                  <td className="tabla__numero">
                    <strong>{formatearPesos(total)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      <Campo etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} errores={error?.campos.notes} autoComplete="off" />
      <p className="texto-suave">Lo vendido se suma a lo que debe el local; lo devuelto vuelve al inventario.</p>
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending || !pendientes.data?.length}>
          {guardar.isPending ? 'Registrando…' : 'Registrar reporte'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
