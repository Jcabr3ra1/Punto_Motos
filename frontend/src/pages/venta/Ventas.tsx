import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import { listarVentas, type FiltrosDeVentas } from '../../api/ventas'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'

function leerFiltros(params: URLSearchParams): FiltrosDeVentas {
  const numero = Number(params.get('number'))
  const pagina = Number(params.get('page'))
  const anuladas = params.get('voided')
  return {
    number: Number.isInteger(numero) && numero > 0 ? numero : undefined,
    voided: anuladas === 'true' ? true : anuladas === 'false' ? false : undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
  }
}

// Historial de ventas (todos los roles), de la más reciente a la más antigua.
export function Ventas() {
  const [params, setParams] = useSearchParams()
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

  const ventas = useQuery({
    queryKey: [...claves.ventas, filtros],
    queryFn: ({ signal }) => listarVentas(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const hayFiltros = Boolean(filtros.number || filtros.voided !== undefined || filtros.date_from || filtros.date_to)

  return (
    <>
      <Titulo nivel={2}>Ventas</Titulo>
      <div className="filtros" role="search" aria-label="Filtrar ventas">
        <Campo
          etiqueta="N.º de recibo"
          type="number"
          inputMode="numeric"
          min={1}
          value={filtros.number ?? ''}
          onChange={(e) => cambiar({ number: e.target.value || undefined })}
        />
        <CampoSelector
          etiqueta="Estado"
          value={filtros.voided === undefined ? '' : String(filtros.voided)}
          onChange={(e) => cambiar({ voided: e.target.value || undefined })}
          opciones={[
            { valor: '', texto: 'Todas' },
            { valor: 'false', texto: 'Vigentes' },
            { valor: 'true', texto: 'Anuladas' },
          ]}
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

      {ventas.isPending && <Cargando />}
      {ventas.isError && <ErrorDeCarga error={ventas.error} onReintentar={() => void ventas.refetch()} />}
      {ventas.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {ventas.data.count === 1 ? '1 venta' : `${formatearNumero(ventas.data.count)} ventas`}
          </p>
          {ventas.data.count === 0 ? (
            <p className="texto-suave">{hayFiltros ? 'Ninguna venta coincide con los filtros.' : 'Todavía no hay ventas.'}</p>
          ) : (
            <>
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Ventas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recibo</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Cliente</th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                      <th scope="col">Vendió</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.data.results.map((venta) => (
                      <tr key={venta.id} className={venta.is_voided ? 'tabla__fila--inactiva' : undefined}>
                        <th scope="row">
                          <Link to={`/venta/historial/${venta.id}`}>N.º {venta.number}</Link>
                          {venta.is_voided && <span className="etiqueta etiqueta--peligro">Anulada</span>}
                        </th>
                        <td className="tabla__nowrap">{formatearFechaHora(venta.created_at)}</td>
                        <td>
                          {venta.customer.name}
                          {venta.customer.phone && <span className="tabla__detalle">{venta.customer.phone}</span>}
                        </td>
                        <td className="tabla__numero">{formatearPesos(venta.total)}</td>
                        <td>{venta.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                etiqueta="Páginas de ventas"
                pagina={filtros.page ?? 1}
                total={ventas.data.count}
                hayAnterior={Boolean(ventas.data.previous)}
                haySiguiente={Boolean(ventas.data.next)}
                onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
