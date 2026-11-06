import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { isApiError } from '../../api/client'
import { borrarCompra, crearCompra, editarCompra, listarProveedores } from '../../api/compras'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { Product, PurchaseDetail, PurchaseInput, ReceivedPurchase } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BuscadorDeProductos } from '../../components/BuscadorDeProductos'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { formatearPesos } from '../../utilidades/dinero'
import { RecibirCompra } from './RecibirCompra'
import { DialogoDeConfirmacion } from '../../components/DialogoDeConfirmacion'

interface Linea {
  producto: { id: number; code: string; name: string }
  cantidad: string
  costo: string
}

interface Props {
  /** Borrador ya guardado; sin él se crea uno nuevo. */
  compra?: PurchaseDetail
  /** La compra ya estaba recibida (409): la pantalla debe recargarla. */
  onYaRecibida?: (mensaje: string) => void
  /** Se guardó el borrador existente. */
  onGuardada?: (aviso: string) => void
  /** Se recibió la compra: trae los precios que subieron. */
  onRecibida?: (recibida: ReceivedPurchase) => void
}

const lineasDe = (compra?: PurchaseDetail): Linea[] =>
  (compra?.items ?? []).map((item) => ({
    producto: item.product,
    cantidad: String(item.quantity),
    costo: String(item.unit_cost),
  }))

/** Representación comparable del formulario, para saber si hay cambios sin guardar. */
const huella = (proveedor: string, documento: string, notas: string, lineas: Linea[]) =>
  JSON.stringify([proveedor, documento.trim(), notas.trim(), lineas.map((l) => [l.producto.id, l.cantidad, l.costo])])

// Borrador de compra (solo el dueño). No toca el inventario hasta recibirla.
export function FormularioDeCompra({ compra, onYaRecibida, onGuardada, onRecibida }: Props) {
  const clienteDeConsultas = useQueryClient()
  const navegar = useNavigate()
  const editando = compra !== undefined

  const proveedores = useQuery({
    queryKey: [...claves.proveedores, {}],
    queryFn: ({ signal }) => listarProveedores({}, signal),
  })

  const [proveedor, setProveedor] = useState(compra ? String(compra.supplier.id) : '')
  const [documento, setDocumento] = useState(compra?.document_number ?? '')
  const [notas, setNotas] = useState(compra?.notes ?? '')
  const [lineas, setLineas] = useState<Linea[]>(() => lineasDe(compra))
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)

  const guardada = compra
    ? huella(String(compra.supplier.id), compra.document_number, compra.notes, lineasDe(compra))
    : huella('', '', '', [])
  const hayCambios = huella(proveedor, documento, notas, lineas) !== guardada

  function siYaRecibida(fallo: unknown) {
    if (isApiError(fallo) && fallo.code === 'purchase_received') {
      void clienteDeConsultas.invalidateQueries({ queryKey: claves.compras })
      onYaRecibida?.(fallo.message)
    }
  }

  const guardar = useMutation({
    mutationFn: () => {
      // Las líneas enviadas reemplazan todas las anteriores. Lo vacío no se envía para que el backend lo pida.
      const datos = {
        ...(proveedor ? { supplier: Number(proveedor) } : {}),
        document_number: documento,
        notes: notas,
        items: lineas.map((l) => ({
          product: l.producto.id,
          ...(l.cantidad !== '' ? { quantity: Number(l.cantidad) } : {}),
          ...(l.costo !== '' ? { unit_cost: Number(l.costo) } : {}),
        })),
      } as PurchaseInput
      return editando ? editarCompra(compra.id, datos) : crearCompra(datos)
    },
    onSuccess: async (guardado) => {
      clienteDeConsultas.setQueryData([...claves.compras, 'detalle', guardado.id], guardado)
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.compras })
      if (editando) onGuardada?.(`Borrador guardado. Total: ${formatearPesos(guardado.total)}.`)
      else navegar(`/compras/lista/${guardado.id}`, { state: { aviso: 'Borrador creado. Puedes seguir editándolo o recibir la compra.' } })
    },
    onError: siYaRecibida,
  })

  const borrar = useMutation({
    mutationFn: () => borrarCompra(compra!.id),
    onSuccess: async () => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.compras })
      navegar('/compras/lista', { state: { aviso: 'Borrador borrado.' } })
    },
    onError: siYaRecibida,
  })

  if (proveedores.isPending) return <Cargando />
  if (proveedores.isError) return <ErrorDeCarga error={proveedores.error} onReintentar={() => void proveedores.refetch()} />

  const error = guardar.isError ? desglosarError(guardar.error) : borrar.isError ? desglosarError(borrar.error) : null
  // Si el proveedor del borrador se desactivó después, se muestra igual en vez de un valor falso.
  const opcionesDeProveedor = [...proveedores.data]
  if (compra && !opcionesDeProveedor.some((p) => p.id === compra.supplier.id)) {
    opcionesDeProveedor.push({ ...compra.supplier, name: `${compra.supplier.name} (desactivado)` } as never)
  }
  const totalOrientativo = lineas.reduce((suma, l) => suma + (Number(l.cantidad) || 0) * (Number(l.costo) || 0), 0)

  function agregar(producto: Product) {
    const existente = lineas.findIndex((l) => l.producto.id === producto.id)
    if (existente >= 0) {
      // Una sola línea por producto: se suma a la que ya existe.
      setLineas((actuales) =>
        actuales.map((l, i) => (i === existente ? { ...l, cantidad: String((Number(l.cantidad) || 0) + 1) } : l)),
      )
      setMensaje(`«${producto.name}» ya estaba en la compra: se sumó una unidad.`)
      return
    }
    setMensaje(null)
    setLineas((actuales) => [
      ...actuales,
      // El costo por unidad se precarga con el costo actual del producto.
      { producto: { id: producto.id, code: producto.code, name: producto.name }, cantidad: '1', costo: String(producto.cost_price ?? 0) },
    ])
  }

  function cambiarLinea(indice: number, cambios: Partial<Linea>) {
    setLineas((actuales) => actuales.map((l, i) => (i === indice ? { ...l, ...cambios } : l)))
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <>
      <form onSubmit={alEnviar} noValidate className="formulario formulario--ancho">
        <AvisoDeError mensajes={[...(error?.generales ?? []), ...(error?.campos.items ?? [])]} />
        <div className="campos-en-fila">
          <CampoSelector
            etiqueta="Proveedor"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            opciones={[
              { valor: '', texto: 'Elige un proveedor' },
              ...opcionesDeProveedor.map((p) => ({ valor: String(p.id), texto: p.name })),
            ]}
            errores={error?.campos.supplier}
            required
          />
          <Campo
            etiqueta="Factura o remisión"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            errores={error?.campos.document_number}
            ayuda="Opcional. El número del documento del proveedor."
            maxLength={40}
            autoComplete="off"
          />
        </div>

        <BuscadorDeProductos etiqueta="Agregar producto" incluirAgotados onElegir={agregar} />
        <div role="status" className="texto-suave">
          {mensaje}
        </div>

        {lineas.length === 0 ? (
          <p className="texto-suave">Busca los productos que llegaron y pulsa Enter para agregarlos.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Productos de la compra</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Costo por unidad</th>
                  <th scope="col" className="tabla__numero">
                    Subtotal
                  </th>
                  <th scope="col">
                    <span className="solo-lectores">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea, indice) => {
                  const erroresDeLinea = [
                    ...(error?.campos[`items.${indice}.product`] ?? []),
                    ...(error?.campos[`items.${indice}.quantity`] ?? []),
                    ...(error?.campos[`items.${indice}.unit_cost`] ?? []),
                  ]
                  return (
                    <tr key={linea.producto.id}>
                      <th scope="row">
                        {linea.producto.name}
                        <span className="tabla__detalle tabla__codigo">{linea.producto.code}</span>
                        {erroresDeLinea.length > 0 && (
                          <ul className="campo__errores">
                            {erroresDeLinea.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        )}
                      </th>
                      <td>
                        <input
                          type="number"
                          className="celda-numero"
                          aria-label={`Cantidad de ${linea.producto.name}`}
                          min={1}
                          step={1}
                          value={linea.cantidad}
                          onChange={(e) => cambiarLinea(indice, { cantidad: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="celda-numero celda-numero--ancha"
                          aria-label={`Costo por unidad de ${linea.producto.name}`}
                          min={0}
                          step={1}
                          value={linea.costo}
                          onChange={(e) => cambiarLinea(indice, { costo: e.target.value })}
                        />
                      </td>
                      <td className="tabla__numero">
                        {formatearPesos((Number(linea.cantidad) || 0) * (Number(linea.costo) || 0))}
                      </td>
                      <td className="tabla__acciones">
                        <button
                          type="button"
                          className="boton-enlace"
                          aria-label={`Quitar ${linea.producto.name}`}
                          onClick={() => setLineas((actuales) => actuales.filter((_, i) => i !== indice))}
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
                    Total (orientativo)
                  </th>
                  <td className="tabla__numero">
                    <strong>{formatearPesos(totalOrientativo)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <Campo
          etiqueta="Notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          errores={error?.campos.notes}
          maxLength={200}
          autoComplete="off"
        />

        <div className="acciones">
          <button type="submit" className="boton boton--auto" disabled={guardar.isPending || (editando && !hayCambios)}>
            {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar borrador'}
          </button>
          <button type="button" className="boton boton--secundario boton--auto" onClick={() => navegar('/compras/lista')}>
            {editando ? 'Volver a la lista' : 'Cancelar'}
          </button>
          {editando && (
            <button type="button" className="boton boton--secundario boton--auto" onClick={() => setConfirmandoBorrado(true)}>
              Borrar borrador
            </button>
          )}
          {confirmandoBorrado && (
            <DialogoDeConfirmacion
              titulo="¿Borrar este borrador?"
              accion={borrar.isPending ? 'Borrando…' : 'Sí, borrar'}
              cancelar="Volver"
              peligro
              ocupado={borrar.isPending}
              onConfirmar={() => borrar.mutate()}
              onCancelar={() => setConfirmandoBorrado(false)}
            >
              <p>La compra todavía no se recibió: no cambia el inventario ni lo que se le debe al proveedor.</p>
            </DialogoDeConfirmacion>
          )}
        </div>
      </form>

      {editando && (
        <RecibirCompra compra={compra} hayCambios={hayCambios} onYaRecibida={onYaRecibida} onRecibida={onRecibida} />
      )}
    </>
  )
}
