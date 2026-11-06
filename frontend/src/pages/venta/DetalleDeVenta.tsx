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
import { Titulo } from '../../components/Titulo'
import { ComprobanteDeDevolucion } from './ComprobanteDeDevolucion'
import { FormularioDeDevolucion } from './FormularioDeDevolucion'
import { Recibo } from './Recibo'

// Una venta, para consultarla. El dueño puede anularla con un motivo: no se borra, las unidades vuelven al
// inventario y los pagos se reembolsan desde la caja abierta. También se pueden registrar devoluciones parciales o totales.
export function DetalleDeVenta() {
  const id = Number(useParams().id)
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

  if (venta.isPending) return <Cargando />
  if (venta.isError) return <ErrorDeCarga error={venta.error} onReintentar={() => void venta.refetch()} />

  const hayPorDevolver =
    venta.data.items.some((i) => i.quantity - i.returned_quantity > 0) ||
    venta.data.services.some((s) => !s.is_returned)

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Venta n.º {venta.data.number}</Titulo>
        <Link to="/venta/historial">Volver a las ventas</Link>
      </div>
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

      {!venta.data.is_voided && (
        <section className="terminar" aria-label="Acciones de la venta">
          {!anulando && !devolviendo && (
            <div className="acciones">
              {hayPorDevolver && (
                <button
                  type="button"
                  className="boton boton--secundario boton--auto"
                  onClick={() => {
                    setAviso(null)
                    setDevolviendo(true)
                  }}
                >
                  Devolver…
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
                  Anular venta…
                </button>
              )}
            </div>
          )}
          {devolviendo && (
            <FormularioDeDevolucion
              venta={venta.data}
              esDueno={esDueno}
              onRegistrada={(registrada) => {
                setDevolviendo(false)
                setDevolucionRegistrada(registrada)
                setAviso(`Devolución n.º ${registrada.number} registrada.`)
                void clienteDeConsultas.invalidateQueries({ queryKey: clave })
              }}
              onCancelar={() => setDevolviendo(false)}
            />
          )}
          {esDueno && anulando && (
            <div role="group" aria-labelledby="titulo-anular" className="confirmacion">
              <Titulo nivel={3}>
                <span id="titulo-anular">¿Anular la venta n.º {venta.data.number}?</span>
              </Titulo>
              <p>
                No se borra: queda marcada como anulada, las unidades vuelven al inventario y cada pago se reembolsa por
                el mismo medio desde la caja abierta.
              </p>
              <AvisoDeError mensajes={error?.generales ?? []} />
              <Campo
                etiqueta="Motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                errores={error?.campos.reason}
                ayuda="Obligatorio. Por ejemplo: «Se cobró al cliente equivocado»."
                autoComplete="off"
                autoFocus
              />
              <div className="acciones">
                <button
                  type="button"
                  className="boton boton--peligro boton--auto"
                  disabled={anular.isPending}
                  onClick={() => anular.mutate()}
                >
                  {anular.isPending ? 'Anulando…' : 'Sí, anular la venta'}
                </button>
                <button
                  type="button"
                  className="boton boton--secundario boton--auto"
                  onClick={() => {
                    anular.reset()
                    setAnulando(false)
                  }}
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}
