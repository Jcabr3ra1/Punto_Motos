import { Plus } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { listarCompras, listarProveedores, type FiltrosDeCompras } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { PaymentStatus, PurchaseStatus } from '../../api/types'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { useAtajo } from '../../hooks/useAtajo'
import { useConteo } from '../../hooks/useConteo'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { ESTADO_DE_PAGO } from './etiquetas'
import { EstadoVacio } from '../../components/EstadoVacio'

const ESTADOS = [
  { valor: '', texto: 'Todas' },
  { valor: 'draft', texto: 'Borradores' },
  { valor: 'received', texto: 'Recibidas' },
]

const PAGOS = [
  { valor: '', texto: 'Cualquiera' },
  { valor: 'pending,partial', texto: 'Con saldo' },
  { valor: 'pending', texto: 'Sin abonos' },
  { valor: 'partial', texto: 'Con abonos' },
  { valor: 'paid', texto: 'Pagadas' },
]

/** Los filtros viven en la dirección: sirven los enlaces y el botón «atrás». */
function leerFiltros(params: URLSearchParams): FiltrosDeCompras {
  const proveedor = Number(params.get('supplier'))
  const pagina = Number(params.get('page'))
  const pagos = params.get('payment_status')
  return {
    supplier: Number.isInteger(proveedor) && proveedor > 0 ? proveedor : undefined,
    status: (params.get('status') || undefined) as PurchaseStatus | undefined,
    payment_status: pagos ? (pagos.split(',') as PaymentStatus[]) : undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
  }
}

export function ListaDeCompras() {
  const [params, setParams] = useSearchParams()
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso
  const filtros = leerFiltros(params)

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  const proveedores = useQuery({
    queryKey: [...claves.proveedores, { include_inactive: true }],
    queryFn: ({ signal }) => listarProveedores({ include_inactive: true }, signal),
  })
  const compras = useQuery({
    queryKey: [...claves.compras, filtros],
    queryFn: ({ signal }) => listarCompras(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const hayFiltros = Boolean(filtros.supplier || filtros.status || filtros.payment_status || filtros.date_from || filtros.date_to)
  const navegar = useNavigate()
  useAtajo('n', () => navegar('/compras/lista/nueva'))

  // Cifras exactas: el total de cada consulta. La API filtra las fechas por el día de creación, no el de recepción,
  // así que se cuenta lo recibido que falta por pagar, que sí es exacto.
  const borradores = useConteo([...claves.compras, 'borradores'], (signal) => listarCompras({ status: 'draft', page_size: 1 }, signal))
  const porPagar = useConteo([...claves.compras, 'por-pagar'], (signal) =>
    listarCompras({ status: 'received', payment_status: ['pending', 'partial'], page_size: 1 }, signal),
  )

  return (
    <>
      <EncabezadoDePantalla
        icono={DESTINOS.comprasLista.icono}
        titulo="Compras"
        descripcion="Mercancía que llega de los proveedores: borradores y compras recibidas."
        acciones={
          <Link
            to="/compras/lista/nueva"
            className="boton boton--auto boton--con-icono boton--enlace-de-accion"
            aria-keyshortcuts="Control+N"
          >
            <Plus aria-hidden="true" size={16} />
            Nueva compra
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+N
            </kbd>
          </Link>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Borradores', valor: formatearNumero(borradores.data ?? 0), cargando: borradores.isPending, error: borradores.isError },
          {
            rotulo: 'Recibidas por pagar',
            valor: formatearNumero(porPagar.data ?? 0),
            cargando: porPagar.isPending,
            error: porPagar.isError,
          },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}

      <div className="filtros" role="search" aria-label="Filtrar compras">
        <CampoSelector
          etiqueta="Proveedor"
          value={filtros.supplier ? String(filtros.supplier) : ''}
          onChange={(e) => cambiar({ supplier: e.target.value || undefined })}
          opciones={[
            { valor: '', texto: 'Todos los proveedores' },
            ...(proveedores.data ?? []).map((p) => ({ valor: String(p.id), texto: p.name })),
          ]}
        />
        <CampoSelector
          etiqueta="Estado"
          value={filtros.status ?? ''}
          onChange={(e) => cambiar({ status: e.target.value || undefined })}
          opciones={ESTADOS}
        />
        <CampoSelector
          etiqueta="Pago"
          value={filtros.payment_status?.join(',') ?? ''}
          onChange={(e) => cambiar({ payment_status: e.target.value || undefined })}
          opciones={PAGOS}
        />
        <Campo
          etiqueta="Desde"
          type="date"
          value={filtros.date_from ?? ''}
          onChange={(e) => cambiar({ date_from: e.target.value || undefined })}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={filtros.date_to ?? ''}
          onChange={(e) => cambiar({ date_to: e.target.value || undefined })}
        />
      </div>

      {compras.isPending && <Cargando />}
      {compras.isError && <ErrorDeCarga error={compras.error} onReintentar={() => void compras.refetch()} />}
      {compras.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {compras.data.count === 1 ? '1 compra' : `${formatearNumero(compras.data.count)} compras`}
          </p>
          {compras.data.count === 0 ? (
            <EstadoVacio
              icono={DESTINOS.comprasLista.icono}
              mensaje={hayFiltros ? 'Ninguna compra coincide con los filtros.' : 'Todavía no hay compras. Crea la primera con «Nueva compra».'}
            />
          ) : (
            <>
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Compras</caption>
                  <thead>
                    <tr>
                      <th scope="col">Compra</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Proveedor</th>
                      <th scope="col">Estado</th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                      <th scope="col" className="tabla__numero">
                        Saldo
                      </th>
                      <th scope="col">Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compras.data.results.map((compra) => (
                      <tr key={compra.id}>
                        <th scope="row">
                          <Link to={`/compras/lista/${compra.id}`}>
                            {compra.document_number || `Compra n.º ${compra.id}`}
                          </Link>
                          <span className="tabla__detalle">
                            {compra.items_count === 1 ? '1 producto' : `${compra.items_count} productos`}
                          </span>
                        </th>
                        <td className="tabla__nowrap">{formatearFechaHora(compra.created_at)}</td>
                        <td>{compra.supplier.name}</td>
                        <td>
                          {compra.status === 'draft' ? (
                            <span className="etiqueta etiqueta--neutra">{compra.status_label}</span>
                          ) : (
                            compra.status_label
                          )}
                        </td>
                        <td className="tabla__numero">{formatearPesos(compra.total)}</td>
                        <td className="tabla__numero">
                          {compra.status === 'draft' ? '—' : formatearPesos(compra.balance_due)}
                        </td>
                        <td>{compra.payment_status ? ESTADO_DE_PAGO[compra.payment_status] : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                etiqueta="Páginas de compras"
                pagina={filtros.page ?? 1}
                total={compras.data.count}
                hayAnterior={Boolean(compras.data.previous)}
                haySiguiente={Boolean(compras.data.next)}
                onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
