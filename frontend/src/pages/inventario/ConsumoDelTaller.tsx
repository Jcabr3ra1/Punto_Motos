import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { listarProductos } from '../../api/productos'
import { registrarConsumoDelTaller } from '../../api/taller'
import type { WorkshopUseInput } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { formatearNumero } from '../../utilidades/numeros'

// Consumo del taller (solo el dueño): los insumos (grasa, líquido de frenos…) no se cobran al cliente; cuando se
// abre un envase para el taller se registra su salida.
export function ConsumoDelTaller({ onTerminar, onCancelar }: { onTerminar: (aviso: string) => void; onCancelar: () => void }) {
  const clienteDeConsultas = useQueryClient()
  const insumos = useQuery({
    queryKey: [...claves.productos, { workshop_supply: true, page_size: 200 }],
    queryFn: ({ signal }) => listarProductos({ workshop_supply: true }, signal),
  })
  const [producto, setProducto] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState('')

  const guardar = useMutation({
    mutationFn: () =>
      registrarConsumoDelTaller({
        ...(producto ? { product: Number(producto) } : {}),
        ...(cantidad !== '' ? { quantity: Number(cantidad) } : {}),
        reason: motivo,
      } as WorkshopUseInput),
    onSuccess: async (movimiento) => {
      await Promise.all(
        [claves.movimientos, claves.productos, ['buscador'], ['producto']].map((queryKey) => clienteDeConsultas.invalidateQueries({ queryKey })),
      )
      onTerminar(`Consumo registrado: «${movimiento.product.name}» ahora tiene ${formatearNumero(movimiento.balance_after)} ${movimiento.balance_after === 1 ? 'unidad' : 'unidades'}.`)
    },
  })
  const error = guardar.isError ? desglosarError(guardar.error) : null

  if (insumos.isPending) return <Cargando />
  if (insumos.isError) return <ErrorDeCarga error={insumos.error} onReintentar={() => void insumos.refetch()} />

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <AvisoDeError mensajes={error?.generales ?? []} />
      {insumos.data.results.length === 0 ? (
        <p className="aviso aviso--info">
          No hay productos marcados como insumo de taller. Márcalos en el formulario de producto («Insumo de taller»).
        </p>
      ) : (
        <CampoSelector
          etiqueta="Insumo"
          value={producto}
          onChange={(e) => setProducto(e.target.value)}
          opciones={[
            { valor: '', texto: 'Elige un insumo' },
            ...insumos.data.results.map((p) => ({ valor: String(p.id), texto: `${p.code} · ${p.name} (hay ${p.stock})` })),
          ]}
          errores={error?.campos.product}
          required
        />
      )}
      <Campo
        etiqueta="Unidades que se sacan"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        errores={error?.campos.quantity}
        required
      />
      <Campo
        etiqueta="Motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        errores={error?.campos.reason}
        ayuda="Opcional. Por ejemplo: «Envase abierto para el taller»."
        maxLength={200}
        autoComplete="off"
      />
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending || insumos.data.results.length === 0}>
          {guardar.isPending ? 'Guardando…' : 'Registrar consumo'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
