import { Ban, Undo2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { SaleReturnDetail } from '../../api/types'
import { anularVenta, obtenerVenta } from '../../api/ventas'
import { useUsuario } from '../../auth/useUsuario'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { DialogoDeConfirmacion } from '../../components/DialogoDeConfirmacion'
import { PanelLateral } from '../../components/PanelLateral'
import { Titulo } from '../../components/Titulo'
import { VentanaDeDocumento } from '../../components/VentanaDeDocumento'
import { ComprobanteDeDevolucion } from './ComprobanteDeDevolucion'
import { FormularioDeDevolucion } from './FormularioDeDevolucion'
import { Recibo } from './Recibo'

/**
 * Una venta, para consultarla. El dueño puede anularla con un motivo: no se borra, las unidades vuelven al inventario
 * y los pagos se reembolsan desde la caja abierta. También se pueden registrar devoluciones parciales o totales.
 * Devuelve las partes por separado (el recibo y sus botones) para usarlas en la página o en una ventana emergente.
 */
function useReciboConAcciones(id: number) {
  const esDueno = useUsuario().role === 'owner'
  const clienteDeConsultas = useQueryClient()
  const [anulando, setAnulando] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  const [devolucionRegistrada, setDevolucionRegistrada] = useState<SaleReturnDetail | null>(null)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const clave = [...claves.ventas, 'detalle', id]
  const venta = useQuery({ queryKey: clave, queryFn: ({ signal }) => obtenerVenta(id, signal) })

  const anular = useMutation({
    mutationFn: () => anularVenta(id, motivo),
    onSuccess: async (anulada) => {
      clienteDeConsultas.setQueryData(clave, anulada)
      setAnulando(false)
      setAviso(`Venta n.º ${anulada.number} anulada: las unidades volvieron al inventario y los pagos se reembolsaron.`)
      await Promise.all(
        [claves.ventas, claves.caja, claves.productos, claves.movimientos, ['buscador'], ['producto']].map((queryKey) =>
          clienteDeConsultas.invalidateQueries({ queryKey }),
        ),
      )
    },
    onError: (fallo) => {
      if (isApiError(fallo) && (fallo.code === 'sale_voided' || fallo.code === 'sale_has_returns')) {
        void clienteDeConsultas.invalidateQueries({ queryKey: clave })
      }
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
    },
  })
  const error = anular.isError ? desglosarError(anular.error) : null
  const datos = venta.data

  const hayPorDevolver =
    datos !== undefined &&
    (datos.items.some((i) => i.quantity - i.returned_quantity > 0) || datos.services.some((s) => !s.is_returned))

  const contenido = venta.isPending ? (
    <Cargando />
  ) : venta.isError ? (
    <ErrorDeCarga error={venta.error} onReintentar={() => void venta.refetch()} />
  ) : (
    <>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <Recibo venta={venta.data} />
      {devolucionRegistrada && (
        <section className="terminar" aria-label="Última devolución registrada">
          <ComprobanteDeDevolucion devolucion={devolucionRegistrada} />
        </section>
      )}
    </>
  )

  const acciones =
    datos && !datos.is_voided ? (
      <>
        {hayPorDevolver && (
          <button
            type="button"
            className="boton boton--secundario boton--auto"
            onClick={() => {
              setAviso(null)
              setDevolviendo(true)
            }}
          >
            <Undo2 aria-hidden="true" size={16} />
            Devolver
          </button>
        )}
        {esDueno && (
          <button
            type="button"
            className="boton boton--secundario boton--auto"
            onClick={() => {
              setAviso(null)
              setAnulando(true)
            }}
          >
            <Ban aria-hidden="true" size={16} />
            Anular venta
          </button>
        )}
      </>
    ) : null

  const ventanas = datos && (
    <>
      {devolviendo && (
        <PanelLateral
          titulo="Devolver productos o servicios"
          modulo="Venta"
          descripcion={`Venta n.º ${datos.number}: elige qué devuelve el cliente y cómo se le reembolsa.`}
          ancho="ancho"
          onCerrar={() => setDevolviendo(false)}
        >
          <FormularioDeDevolucion
            venta={datos}
            esDueno={esDueno}
            onRegistrada={(registrada) => {
              setDevolviendo(false)
              setDevolucionRegistrada(registrada)
              setAviso(`Devolución n.º ${registrada.number} registrada.`)
              void clienteDeConsultas.invalidateQueries({ queryKey: clave })
            }}
            onCancelar={() => setDevolviendo(false)}
          />
        </PanelLateral>
      )}
      {esDueno && anulando && (
        <DialogoDeConfirmacion
          titulo={`¿Anular la venta n.º ${datos.number}?`}
          accion={anular.isPending ? 'Anulando…' : 'Sí, anular la venta'}
          cancelar="Volver"
          peligro
          ocupado={anular.isPending}
          onConfirmar={() => anular.mutate()}
          onCancelar={() => {
            anular.reset()
            setAnulando(false)
          }}
        >
          <p>
            No se borra: queda marcada como anulada, las unidades vuelven al inventario y cada pago se reembolsa por el
            mismo medio desde la caja abierta.
          </p>
          <AvisoDeError mensajes={error?.generales ?? []} />
          <Campo
            etiqueta="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            errores={error?.campos.reason}
            ayuda="Obligatorio. Por ejemplo: «Se cobró al cliente equivocado»."
            autoComplete="off"
          />
        </DialogoDeConfirmacion>
      )}
    </>
  )

  return { venta, contenido, acciones, ventanas }
}

/** La venta en su propia página (dirección directa `/venta/historial/:id`). */
export function DetalleDeVenta() {
  const id = Number(useParams().id)
  const { venta, contenido, acciones, ventanas } = useReciboConAcciones(id)
  return (
    <>
      {venta.data && (
        <div className="barra-de-acciones">
          <Titulo nivel={2}>Venta n.º {venta.data.number}</Titulo>
          <Link to="/venta/historial">Volver a las ventas</Link>
        </div>
      )}
      {contenido}
      {acciones && (
        <section className="terminar" aria-label="Acciones de la venta">
          <div className="acciones">{acciones}</div>
        </section>
      )}
      {ventanas}
    </>
  )
}

/** La venta en una ventana emergente sobre la lista: el recibo, y Devolver y Anular en el pie. */
export function VentanaDeRecibo({ id, numero, onCerrar }: { id: number; numero: number; onCerrar: () => void }) {
  const { contenido, acciones, ventanas } = useReciboConAcciones(id)
  return (
    <>
      <VentanaDeDocumento titulo={`Venta n.º ${numero}`} onCerrar={onCerrar} acciones={acciones}>
        {contenido}
      </VentanaDeDocumento>
      {ventanas}
    </>
  )
}
