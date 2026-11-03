import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client'
import { listarEntregas, registrarEntrega } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { Product } from '../../api/types'
import { nuevaClaveDeReintento } from '../../api/ventas'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BuscadorDeProductos } from '../../components/BuscadorDeProductos'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { SelectorDeLocal } from './SelectorDeLocal'

// Entregas en consignación (solo el dueño): las unidades salen del inventario hacia otro local, con un valor
// pactado por unidad (por defecto el costo). No se editan ni se borran.
export function Entregas() {
  const [nueva, setNueva] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [local, setLocal] = useState('')
  const [pagina, setPagina] = useState(1)
  const filtros = { consignee: local ? Number(local) : undefined, page: pagina }
  const entregas = useQuery({
    queryKey: [...claves.consignacion, 'entregas', filtros],
    queryFn: ({ signal }) => listarEntregas(filtros, signal),
    placeholderData: keepPreviousData,
  })

  if (nueva) {
    return (
      <>
        <Titulo nivel={2}>Nueva entrega</Titulo>
        <FormularioDeEntrega
          onTerminar={(m) => {
            setAviso(m)
            setNueva(false)
          }}
          onCancelar={() => setNueva(false)}
        />
      </>
    )
  }

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Entregas</Titulo>
        <button
          type="button"
          className="boton boton--auto"
          onClick={() => {
            setAviso(null)
            setNueva(true)
          }}
        >
          Nueva entrega
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
      {entregas.isPending && <Cargando />}
      {entregas.isError && <ErrorDeCarga error={entregas.error} onReintentar={() => void entregas.refetch()} />}
      {entregas.isSuccess &&
        (entregas.data.count === 0 ? (
          <p className="texto-suave">Todavía no hay entregas.</p>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Entregas en consignación</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Local</th>
                    <th scope="col">Productos</th>
                    <th scope="col" className="tabla__numero">
                      Valor pactado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entregas.data.results.map((entrega) => (
                    <tr key={entrega.id}>
                      <td className="tabla__nowrap">{formatearFechaHora(entrega.created_at)}</td>
                      <td>{entrega.consignee.name}</td>
                      <td>
                        {entrega.items.map((item) => (
                          <span key={item.id} className="tabla__detalle">
                            {item.quantity} × {item.product.name} ({item.pending_quantity} pendientes)
                          </span>
                        ))}
                      </td>
                      <td className="tabla__numero">{formatearPesos(entrega.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              etiqueta="Páginas de entregas"
              pagina={pagina}
              total={entregas.data.count}
              hayAnterior={Boolean(entregas.data.previous)}
              haySiguiente={Boolean(entregas.data.next)}
              onCambiar={setPagina}
            />
          </>
        ))}
    </>
  )
}

interface Linea {
  producto: Product
  cantidad: string
  valor: string
}

function FormularioDeEntrega({ onTerminar, onCancelar }: { onTerminar: (aviso: string) => void; onCancelar: () => void }) {
  const clienteDeConsultas = useQueryClient()
  const [local, setLocal] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [notas, setNotas] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  // Como en las ventas: la misma clave en los reintentos de esta entrega evita registrarla dos veces.
  const [clave] = useState(nuevaClaveDeReintento)

  const guardar = useMutation({
    mutationFn: () =>
      registrarEntrega({
        idempotency_key: clave,
        ...(local ? { consignee: Number(local) } : {}),
        items: lineas.map((l) => ({
          product: l.producto.id,
          ...(l.cantidad !== '' ? { quantity: Number(l.cantidad) } : {}),
          ...(l.valor !== '' ? { unit_value: Number(l.valor) } : {}),
        })),
        notes: notas,
      } as Parameters<typeof registrarEntrega>[0]),
    onSuccess: async (entrega) => {
      await Promise.all(
        [claves.consignacion, claves.productos, claves.movimientos, ['buscador'], ['producto']].map((queryKey) =>
          clienteDeConsultas.invalidateQueries({ queryKey }),
        ),
      )
      onTerminar(`Entrega a «${entrega.consignee.name}» registrada por ${formatearPesos(entrega.total_value)} de valor pactado.`)
    },
    onError: (fallo) => {
      if (isApiError(fallo) && fallo.code === 'initial_count_open') void clienteDeConsultas.invalidateQueries({ queryKey: ['inventario'] })
    },
  })
  const error = guardar.isError ? desglosarError(guardar.error) : null
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor) || 0), 0)

  function agregar(producto: Product) {
    if (lineas.some((l) => l.producto.id === producto.id)) {
      setMensaje(`«${producto.name}» ya está en la entrega: cambia su cantidad.`)
      return
    }
    setMensaje(null)
    // El valor pactado se precarga con el costo, no con el precio de venta.
    setLineas((a) => [...a, { producto, cantidad: '1', valor: String(producto.cost_price ?? 0) }])
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario formulario--ancho">
      <AvisoDeError mensajes={[...(error?.generales ?? []), ...(error?.campos.items ?? [])]} />
      <SelectorDeLocal valor={local} onCambiar={setLocal} errores={error?.campos.consignee} />
      <BuscadorDeProductos etiqueta="Agregar producto" onElegir={agregar} />
      <div role="status" className="texto-suave">
        {mensaje}
      </div>
      {lineas.length === 0 ? (
        <p className="texto-suave">Agrega los productos que se le entregan al local.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Productos de la entrega</caption>
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Cantidad</th>
                <th scope="col">Valor pactado por unidad</th>
                <th scope="col" className="tabla__numero">
                  Subtotal
                </th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const errores = [
                  ...(error?.campos[`items.${i}.product`] ?? []),
                  ...(error?.campos[`items.${i}.quantity`] ?? []),
                  ...(error?.campos[`items.${i}.unit_value`] ?? []),
                ]
                return (
                  <tr key={l.producto.id}>
                    <th scope="row">
                      {l.producto.name}
                      <span className="tabla__detalle">Hay {l.producto.stock} · costo {formatearPesos(l.producto.cost_price ?? 0)}</span>
                      {errores.length > 0 && (
                        <ul className="campo__errores">
                          {errores.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </th>
                    <td>
                      <input
                        type="number"
                        className="celda-numero"
                        aria-label={`Cantidad de ${l.producto.name}`}
                        min={1}
                        max={l.producto.stock}
                        step={1}
                        value={l.cantidad}
                        onChange={(e) => setLineas((a) => a.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="celda-numero celda-numero--ancha"
                        aria-label={`Valor pactado de ${l.producto.name}`}
                        min={0}
                        step={1}
                        value={l.valor}
                        onChange={(e) => setLineas((a) => a.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                      />
                    </td>
                    <td className="tabla__numero">{formatearPesos((Number(l.cantidad) || 0) * (Number(l.valor) || 0))}</td>
                    <td className="tabla__acciones">
                      <button
                        type="button"
                        className="boton-enlace"
                        aria-label={`Quitar ${l.producto.name}`}
                        onClick={() => setLineas((a) => a.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>
                  Valor pactado total (orientativo)
                </th>
                <td className="tabla__numero">
                  <strong>{formatearPesos(total)}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <Campo etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} errores={error?.campos.notes} autoComplete="off" />
      <p className="texto-suave">Las unidades salen del inventario de la tienda al registrar la entrega.</p>
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending || lineas.length === 0}>
          {guardar.isPending ? 'Registrando…' : 'Registrar entrega'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
