import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import type { ReturnCause } from '../../api/types'
import { listarDevoluciones, obtenerDevolucion, type FiltrosDeDevoluciones } from '../../api/ventas'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Paginacion } from '../../components/Paginacion'
import { useConteo } from '../../hooks/useConteo'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { ComprobanteDeDevolucion } from './ComprobanteDeDevolucion'
import { FichaDeDevolucion } from './FichaDeDevolucion'
import { useHoy } from '../../hooks/useHoy'

function leerFiltros(params: URLSearchParams): FiltrosDeDevoluciones {
  const numero = Number(params.get('number'))
  const venta = Number(params.get('sale'))
  const pagina = Number(params.get('page'))
  const causa = params.get('cause')
  return {
    number: Number.isInteger(numero) && numero > 0 ? numero : undefined,
    sale: Number.isInteger(venta) && venta > 0 ? venta : undefined,
    cause: causa === 'bad_service' || causa === 'other' ? (causa as ReturnCause) : undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
  }
}

/** Historial de devoluciones (todos los roles), de la más reciente a la más antigua. */
export function Devoluciones() {
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

  const devoluciones = useQuery({
    queryKey: [...claves.devoluciones, filtros],
    queryFn: ({ signal }) => listarDevoluciones(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const hayFiltros = Boolean(filtros.number || filtros.sale || filtros.cause || filtros.date_from || filtros.date_to)
  const seleccion = useSeleccion(devoluciones.data?.results, (devolucion) => devolucion.id)
  const hoy = useHoy()
  const deHoy = useConteo([...claves.devoluciones, 'hoy', hoy], (signal) =>
    listarDevoluciones({ date_from: hoy, date_to: hoy, page_size: 1 }, signal),
  )

  return (
    <>
      <EncabezadoDePantalla
        icono={DESTINOS.devoluciones.icono}
        titulo="Devoluciones"
        descripcion="Lo que los clientes devolvieron. Se registran desde el detalle de cada venta."
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Devoluciones de hoy', valor: formatearNumero(deHoy.data ?? 0), cargando: deHoy.isPending, error: deHoy.isError },
        ]}
      />
      <div className="filtros" role="search" aria-label="Filtrar devoluciones">
        <Campo
          etiqueta="N.º de devolución"
          type="number"
          inputMode="numeric"
          min={1}
          value={filtros.number ?? ''}
          onChange={(e) => cambiar({ number: e.target.value || undefined })}
        />
        <CampoSelector
          etiqueta="Causa"
          value={filtros.cause ?? ''}
          onChange={(e) => cambiar({ cause: e.target.value || undefined })}
          opciones={[
            { valor: '', texto: 'Todas' },
            { valor: 'other', texto: 'Otra causa' },
            { valor: 'bad_service', texto: 'Mal servicio del mecánico' },
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

      {devoluciones.isPending && <Cargando />}
      {devoluciones.isError && <ErrorDeCarga error={devoluciones.error} onReintentar={() => void devoluciones.refetch()} />}
      {devoluciones.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {devoluciones.data.count === 1 ? '1 devolución' : `${formatearNumero(devoluciones.data.count)} devoluciones`}
          </p>
          {devoluciones.data.count === 0 ? (
            <EstadoVacio
              icono={Undo2}
              mensaje={hayFiltros ? 'Ninguna devolución coincide con los filtros.' : 'Todavía no hay devoluciones.'}
            />
          ) : (
            <div className={seleccion.elegido ? 'con-ficha' : undefined}>
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-devoluciones">
                <p id="ayuda-devoluciones" className="solo-lectores">
                  Usa las flechas para ver el detalle de cada devolución.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Devoluciones</caption>
                  <thead>
                    <tr>
                      <th scope="col">Devolución</th>
                      <th scope="col">Venta</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Causa</th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                      <th scope="col">Registró</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devoluciones.data.results.map((d) => (
                      <tr
                        key={d.id}
                        className="tabla__fila--elegible"
                        aria-selected={seleccion.elegido?.id === d.id}
                        onClick={() => seleccion.elegir(d)}
                      >
                        <th scope="row">
                          <Link to={`/venta/devoluciones/${d.id}`} className="tabla__codigo">
                            N.º {d.number}
                          </Link>
                        </th>
                        <td>
                          <Link to={`/venta/historial/${d.sale}`}>Venta n.º {d.sale_number}</Link>
                        </td>
                        <td className="tabla__nowrap">{formatearFechaHora(d.created_at)}</td>
                        <td>
                          {d.customer?.name ?? 'Sin cliente'}
                          {d.customer?.phone && <span className="tabla__detalle">{d.customer.phone}</span>}
                        </td>
                        <td>
                          {d.cause_label}
                          <span className="tabla__detalle">{d.reason}</span>
                        </td>
                        <td className="tabla__numero">{formatearPesos(d.total)}</td>
                        <td>{d.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                etiqueta="Páginas de devoluciones"
                pagina={filtros.page ?? 1}
                total={devoluciones.data.count}
                hayAnterior={Boolean(devoluciones.data.previous)}
                haySiguiente={Boolean(devoluciones.data.next)}
                onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              />
              {seleccion.elegido && (
                <FichaDeDevolucion id={seleccion.elegido.id} numero={seleccion.elegido.number} onCerrar={seleccion.cerrar} />
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

/** Detalle de una devolución, para revisarla o reimprimirla. */
export function DetalleDeDevolucion() {
  const id = Number(useParams().id)
  const devolucion = useQuery({
    queryKey: [...claves.devoluciones, 'detalle', id],
    queryFn: ({ signal }) => obtenerDevolucion(id, signal),
  })

  if (devolucion.isPending) return <Cargando />
  if (devolucion.isError) return <ErrorDeCarga error={devolucion.error} onReintentar={() => void devolucion.refetch()} />

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Devolución n.º {devolucion.data.number}</Titulo>
        <Link to="/venta/devoluciones">Volver a las devoluciones</Link>
      </div>
      <ComprobanteDeDevolucion devolucion={devolucion.data} />
    </>
  )
}
