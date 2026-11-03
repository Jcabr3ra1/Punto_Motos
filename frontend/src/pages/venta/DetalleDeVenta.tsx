import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { anularVenta, obtenerVenta } from '../../api/ventas'
import { useUsuario } from '../../auth/useUsuario'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { Recibo } from './Recibo'

// Una venta, para consultarla. El dueño puede anularla con un motivo: no se borra, las unidades vuelven al
// inventario y los pagos se reembolsan desde la caja abierta.
export function DetalleDeVenta() {
  const id = Number(useParams().id)
  const esDueno = useUsuario().role === 'owner'
  const clienteDeConsultas = useQueryClient()
  const [anulando, setAnulando] = useState(false)
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
      if (isApiError(fallo) && fallo.code === 'sale_voided') void clienteDeConsultas.invalidateQueries({ queryKey: clave })
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
    },
  })
  const error = anular.isError ? desglosarError(anular.error) : null

  if (venta.isPending) return <Cargando />
  if (venta.isError) return <ErrorDeCarga error={venta.error} onReintentar={() => void venta.refetch()} />

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

      {esDueno && !venta.data.is_voided && (
        <section className="terminar" aria-label="Anular la venta">
          {!anulando ? (
            <button type="button" className="boton boton--secundario boton--auto" onClick={() => setAnulando(true)}>
              Anular venta…
            </button>
          ) : (
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
