import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError } from '../../api/client'
import { recibirCompra } from '../../api/compras'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { PaymentInput, PaymentMethod, PurchaseDetail, ReceivedPurchase } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Casilla } from '../../components/Casilla'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { hoyEnColombia } from '../../utilidades/fechas'
import { MedioDePago } from './MedioDePago'

interface Props {
  compra: PurchaseDetail
  /** Con cambios sin guardar no se puede recibir: se recibiría lo guardado, no lo que se ve. */
  hayCambios: boolean
  onRecibida?: (recibida: ReceivedPurchase) => void
  onYaRecibida?: (mensaje: string) => void
}

// Recepción de la compra: entran las existencias, se recalculan costos y precios, y la compra queda fija.
// Recepción y abono se guardan juntos: si el abono no es válido, la compra sigue en borrador.
export function RecibirCompra({ compra, hayCambios, onRecibida, onYaRecibida }: Props) {
  const clienteDeConsultas = useQueryClient()
  const [confirmando, setConfirmando] = useState(false)
  const [conAbono, setConAbono] = useState(false)
  const [valor, setValor] = useState('')
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [fecha, setFecha] = useState(hoyEnColombia)

  const recibir = useMutation({
    mutationFn: () => {
      const abono = conAbono
        ? ({ ...(valor !== '' ? { amount: Number(valor) } : {}), method: medio, ...(fecha ? { paid_on: fecha } : {}) } as PaymentInput)
        : null
      return recibirCompra(compra.id, abono ? { payment: abono } : {})
    },
    onSuccess: async (recibida) => {
      clienteDeConsultas.setQueryData([...claves.compras, 'detalle', recibida.id], recibida)
      onRecibida?.(recibida)
      // Cambian existencias, costos, precios, saldos y movimientos.
      await Promise.all(
        [claves.compras, claves.proveedores, claves.abonos, claves.productos, claves.movimientos, ['producto'], ['buscador']].map(
          (queryKey) => clienteDeConsultas.invalidateQueries({ queryKey }),
        ),
      )
    },
    onError: (fallo) => {
      if (isApiError(fallo) && fallo.code === 'purchase_received') {
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.compras })
        onYaRecibida?.(fallo.message)
      }
    },
  })
  const error = recibir.isError ? desglosarError(recibir.error) : null
  const sinProductos = compra.items.length === 0

  return (
    <section className="terminar" aria-label="Recibir la compra">
      {!confirmando ? (
        <>
          <button
            type="button"
            className="boton boton--auto"
            disabled={hayCambios || sinProductos}
            onClick={() => setConfirmando(true)}
          >
            Recibir compra
          </button>
          {(hayCambios || sinProductos) && (
            <p className="campo__ayuda">
              {sinProductos
                ? 'Agrega productos y guarda el borrador antes de recibir.'
                : 'Guarda los cambios antes de recibir: se recibe lo que está guardado.'}
            </p>
          )}
        </>
      ) : (
        <div role="group" aria-labelledby="titulo-recibir" className="confirmacion">
          <Titulo nivel={3}>
            <span id="titulo-recibir">¿Recibir la compra?</span>
          </Titulo>
          <p>
            Entran <strong>{compra.items.length === 1 ? '1 producto' : `${compra.items.length} productos`}</strong> al
            inventario, por un total de <strong>{formatearPesos(compra.total)}</strong>.
          </p>
          <p>
            <strong>Desde ese momento la compra no se edita ni se borra.</strong> Si el costo de un producto sube, su
            precio de venta sube los mismos pesos, redondeado a miles.
          </p>
          <AvisoDeError mensajes={error?.generales ?? []} />
          <Casilla
            etiqueta="Entregar un abono con la mercancía"
            checked={conAbono}
            onChange={(e) => setConAbono(e.target.checked)}
          />
          {conAbono && (
            <>
              <div className="campos-en-fila">
                <Campo
                  etiqueta="Valor del abono"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  errores={error?.campos['payment.amount']}
                  required
                />
                <Campo
                  etiqueta="Fecha de pago"
                  type="date"
                  max={hoyEnColombia()}
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  errores={error?.campos['payment.paid_on']}
                />
              </div>
              <MedioDePago
                nombre="medio-recepcion"
                valor={medio}
                onCambiar={setMedio}
                errores={error?.campos['payment.method']}
              />
            </>
          )}
          <div className="acciones">
            <button type="button" className="boton boton--auto" disabled={recibir.isPending || hayCambios} onClick={() => recibir.mutate()}>
              {recibir.isPending ? 'Recibiendo…' : 'Sí, recibir la compra'}
            </button>
            <button
              type="button"
              className="boton boton--secundario boton--auto"
              onClick={() => {
                recibir.reset()
                setConfirmando(false)
              }}
              autoFocus
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
