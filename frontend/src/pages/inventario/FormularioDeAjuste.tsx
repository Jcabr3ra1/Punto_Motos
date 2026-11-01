import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { crearAjuste } from '../../api/inventario'
import type { AdjustmentInput, Product } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BuscadorDeProductos } from '../../components/BuscadorDeProductos'
import { Campo } from '../../components/Campo'
import { formatearNumero } from '../../utilidades/numeros'

type Sentido = 'entran' | 'salen'

interface Props {
  /** Producto ya elegido (por ejemplo, el del kárdex que se está viendo). */
  productoInicial?: Product
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}

// Ajuste físico de existencias (solo el dueño). El motivo es obligatorio y el movimiento no se puede editar.
export function FormularioDeAjuste({ productoInicial, onTerminar, onCancelar }: Props) {
  const clienteDeConsultas = useQueryClient()
  const [producto, setProducto] = useState<Product | null>(productoInicial ?? null)
  const [sentido, setSentido] = useState<Sentido>('entran')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')

  const guardar = useMutation({
    mutationFn: () => {
      // La pantalla pide una cantidad positiva y el sentido; la API espera la cantidad con signo.
      // Lo vacío no se envía: el backend responde «Este campo es requerido.» junto a cada campo.
      const datos = {
        ...(producto ? { product: producto.id } : {}),
        ...(cantidad !== '' ? { quantity: sentido === 'salen' ? -Math.abs(Number(cantidad)) : Math.abs(Number(cantidad)) } : {}),
        reason: motivo,
      } as AdjustmentInput
      return crearAjuste(datos)
    },
    onSuccess: async (movimiento) => {
      await Promise.all([
        clienteDeConsultas.invalidateQueries({ queryKey: claves.movimientos }),
        // Las existencias que muestran la lista de productos y el buscador cambiaron.
        clienteDeConsultas.invalidateQueries({ queryKey: claves.productos }),
        clienteDeConsultas.invalidateQueries({ queryKey: ['producto'] }),
        clienteDeConsultas.invalidateQueries({ queryKey: ['buscador'] }),
      ])
      const unidades = `${formatearNumero(movimiento.balance_after)} ${movimiento.balance_after === 1 ? 'unidad' : 'unidades'}`
      onTerminar(`Ajuste guardado: «${movimiento.product.name}» ahora tiene ${unidades}.`)
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

      {producto ? (
        <div className="campo">
          <span className="filtro-de-producto__etiqueta">Producto</span>
          <p className="filtro-de-producto">
            <span>
              <span className="tabla__codigo">{producto.code}</span> {producto.name}
              <span className="tabla__detalle">Existencia actual: {formatearNumero(producto.stock)}</span>
            </span>
            {!productoInicial && (
              <button type="button" className="boton-enlace" onClick={() => setProducto(null)}>
                Cambiar
              </button>
            )}
          </p>
        </div>
      ) : (
        <div className="campo">
          <BuscadorDeProductos etiqueta="Producto" incluirAgotados onElegir={setProducto} />
          {error?.campos.product && (
            <ul className="campo__errores">
              {error.campos.product.map((mensaje) => (
                <li key={mensaje}>{mensaje}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset className="conjunto">
        <legend>¿Qué pasó con las unidades?</legend>
        <div className="opciones-en-fila">
          <label className="opcion">
            <input type="radio" name="sentido" checked={sentido === 'entran'} onChange={() => setSentido('entran')} />
            Entran unidades (suma)
          </label>
          <label className="opcion">
            <input type="radio" name="sentido" checked={sentido === 'salen'} onChange={() => setSentido('salen')} />
            Salen unidades (resta)
          </label>
        </div>
      </fieldset>

      <Campo
        etiqueta="Cantidad"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        errores={error?.campos.quantity}
        ayuda="Escribe cuántas unidades, sin signo."
        required
      />
      <Campo
        etiqueta="Motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        errores={error?.campos.reason}
        ayuda="Por ejemplo: «Se dañó en bodega». Es obligatorio y queda en el historial."
        maxLength={200}
        autoComplete="off"
        required
      />

      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar ajuste'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
