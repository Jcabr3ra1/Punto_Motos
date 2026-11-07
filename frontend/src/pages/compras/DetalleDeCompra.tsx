import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { obtenerCompra } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { PriceChange, PurchaseDetail } from '../../api/types'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { PanelLateral } from '../../components/PanelLateral'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia, formatearFechaHora } from '../../utilidades/fechas'
import { ESTADO_DE_PAGO } from './etiquetas'
import { FormularioDeAbono } from './FormularioDeAbono'
import { FormularioDeCompra } from './FormularioDeCompra'

const nombreDeCompra = (compra: { id: number; document_number: string }) =>
  compra.document_number ? `Compra ${compra.document_number}` : `Compra n.º ${compra.id}`

// Una compra: el borrador se edita y se recibe; la recibida solo se consulta y se le abona.
export function DetalleDeCompra() {
  const id = Number(useParams().id)
  const avisoDeLlegada = (useLocation().state as { aviso?: string } | null)?.aviso ?? null
  const [aviso, setAviso] = useState<string | null>(avisoDeLlegada)
  const [cambiosDePrecio, setCambiosDePrecio] = useState<PriceChange[] | null>(null)

  const compra = useQuery({
    queryKey: [...claves.compras, 'detalle', id],
    queryFn: ({ signal }) => obtenerCompra(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  })

  if (compra.isPending) return <Cargando />
  if (compra.isError) return <ErrorDeCarga error={compra.error} onReintentar={() => void compra.refetch()} />

  const datos = compra.data
  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>
          {nombreDeCompra(datos)} · {datos.supplier.name}
        </Titulo>
        <Link to="/compras/lista">Volver a la lista</Link>
      </div>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}

      {datos.status === 'draft' ? (
        <>
          <p className="texto-suave">
            <span className="etiqueta etiqueta--neutra">Borrador</span> Creado el {formatearFechaHora(datos.created_at)} por{' '}
            {datos.created_by}. No toca el inventario hasta recibirla.
          </p>
          {/* La clave reinicia el formulario cuando el backend devuelve una versión nueva. */}
          <FormularioDeCompra
            key={datos.id}
            compra={datos}
            onGuardada={setAviso}
            onYaRecibida={setAviso}
            onRecibida={(recibida) => {
              setAviso('Compra recibida: las existencias, los costos y los saldos ya se actualizaron.')
              setCambiosDePrecio(recibida.price_changes)
            }}
          />
        </>
      ) : (
        <CompraRecibida compra={datos} cambiosDePrecio={cambiosDePrecio} onAviso={setAviso} />
      )}
    </>
  )
}

function CompraRecibida({
  compra,
  cambiosDePrecio,
  onAviso,
}: {
  compra: PurchaseDetail
  cambiosDePrecio: PriceChange[] | null
  onAviso: (aviso: string | null) => void
}) {
  const clienteDeConsultas = useQueryClient()
  const [abonando, setAbonando] = useState(false)

  return (
    <>
      {cambiosDePrecio && cambiosDePrecio.length > 0 && (
        <div role="status" className="aviso aviso--advertencia">
          <p>
            <strong>Estos precios de venta subieron</strong> porque su costo subió:
          </p>
          <ul className="lista-simple">
            {cambiosDePrecio.map((cambio) => (
              <li key={cambio.product.id}>
                {cambio.product.name}: {formatearPesos(cambio.old_price)} → {formatearPesos(cambio.new_price)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="avance" aria-label="Resumen de la compra">
        <div>
          <dt>Total</dt>
          <dd>{formatearPesos(compra.total)}</dd>
        </div>
        <div>
          <dt>Abonado</dt>
          <dd>{formatearPesos(compra.paid_amount)}</dd>
        </div>
        <div>
          <dt>Saldo</dt>
          <dd>{formatearPesos(compra.balance_due)}</dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>{compra.payment_status ? ESTADO_DE_PAGO[compra.payment_status] : '—'}</dd>
        </div>
      </dl>
      <p className="texto-suave">
        Recibida {compra.received_at ? `el ${formatearFechaHora(compra.received_at)}` : ''}
        {compra.received_by ? ` por ${compra.received_by}` : ''}. Ya no se puede editar ni borrar.
        {compra.notes && ` Notas: ${compra.notes}`}
      </p>
      {compra.balance_due > 0 && (
        <button
          type="button"
          className="boton boton--auto"
          onClick={() => {
            onAviso(null)
            setAbonando(true)
          }}
        >
          Abonar a esta compra
        </button>
      )}

      <Titulo nivel={3}>Productos</Titulo>
      <div className="tabla-contenedor">
        <table className="tabla">
          <caption className="solo-lectores">Productos de la compra</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="tabla__numero">
                Cantidad
              </th>
              <th scope="col" className="tabla__numero">
                Costo por unidad
              </th>
              <th scope="col" className="tabla__numero">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {compra.items.map((item) => (
              <tr key={item.id}>
                <th scope="row">
                  {item.product.name}
                  <span className="tabla__detalle tabla__codigo">{item.product.code}</span>
                </th>
                <td className="tabla__numero">{item.quantity}</td>
                <td className="tabla__numero">{formatearPesos(item.unit_cost)}</td>
                <td className="tabla__numero">{formatearPesos(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Titulo nivel={3}>Abonos a esta compra</Titulo>
      {compra.allocations.length === 0 ? (
        <p className="texto-suave">Todavía no hay abonos.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">Abonos aplicados a la compra</caption>
            <thead>
              <tr>
                <th scope="col">Fecha de pago</th>
                <th scope="col">Medio</th>
                <th scope="col" className="tabla__numero">
                  Valor aplicado
                </th>
              </tr>
            </thead>
            <tbody>
              {compra.allocations.map((abono) => (
                <tr key={`${abono.payment}-${abono.amount}`}>
                  <td>{formatearDia(abono.paid_on)}</td>
                  <td>{abono.method_label}</td>
                  <td className="tabla__numero">{formatearPesos(abono.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abonando && (
        <PanelLateral
          titulo="Abonar a esta compra"
          modulo="Compras"
          descripcion={`Compra de «${compra.supplier.name}»: saldo ${formatearPesos(compra.balance_due)}.`}
          onCerrar={() => setAbonando(false)}
        >
          <FormularioDeAbono
            proveedorId={compra.supplier.id}
            compraId={compra.id}
            onTerminar={(mensaje) => {
              onAviso(mensaje)
              setAbonando(false)
              void clienteDeConsultas.invalidateQueries({ queryKey: [...claves.compras, 'detalle', compra.id] })
            }}
            onCancelar={() => setAbonando(false)}
          />
        </PanelLateral>
      )}
    </>
  )
}
