import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import { listarLiquidaciones, listarMecanicos, obtenerLiquidacion } from '../../api/taller'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia, formatearFechaHora } from '../../utilidades/fechas'
import { HojaDeLiquidacion } from './HojaDeLiquidacion'

/** Liquidaciones pagadas (solo el dueño), de la más reciente a la más antigua. */
export function HistorialDeLiquidaciones() {
  const [params, setParams] = useSearchParams()
  const numero = (clave: string) => {
    const valor = Number(params.get(clave))
    return Number.isInteger(valor) && valor > 0 ? valor : undefined
  }
  const filtros = {
    mechanic: numero('mechanic'),
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: numero('page'),
  }

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  const mecanicos = useQuery({ queryKey: claves.mecanicos(true), queryFn: ({ signal }) => listarMecanicos(true, signal) })
  const liquidaciones = useQuery({
    queryKey: [...claves.liquidaciones, 'historial', filtros],
    queryFn: ({ signal }) => listarLiquidaciones(filtros, signal),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <Titulo nivel={2}>Historial de liquidaciones</Titulo>
      <div className="filtros" role="search" aria-label="Filtrar liquidaciones">
        <CampoSelector
          etiqueta="Mecánico"
          value={filtros.mechanic ? String(filtros.mechanic) : ''}
          onChange={(e) => cambiar({ mechanic: e.target.value || undefined })}
          opciones={[{ valor: '', texto: 'Todos' }, ...(mecanicos.data ?? []).map((m) => ({ valor: String(m.id), texto: m.name }))]}
        />
        <Campo etiqueta="Desde" type="date" value={filtros.date_from ?? ''} onChange={(e) => cambiar({ date_from: e.target.value || undefined })} />
        <Campo etiqueta="Hasta" type="date" value={filtros.date_to ?? ''} onChange={(e) => cambiar({ date_to: e.target.value || undefined })} />
      </div>
      {liquidaciones.isPending && <Cargando />}
      {liquidaciones.isError && <ErrorDeCarga error={liquidaciones.error} onReintentar={() => void liquidaciones.refetch()} />}
      {liquidaciones.isSuccess &&
        (liquidaciones.data.count === 0 ? (
          <p className="texto-suave">Todavía no hay liquidaciones.</p>
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Liquidaciones pagadas</caption>
                <thead>
                  <tr>
                    <th scope="col">Día liquidado</th>
                    <th scope="col">Mecánico</th>
                    <th scope="col" className="tabla__numero">
                      Servicios
                    </th>
                    <th scope="col" className="tabla__numero">
                      Mano de obra
                    </th>
                    <th scope="col" className="tabla__numero">
                      Pagado
                    </th>
                    <th scope="col">Pagó</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidaciones.data.results.map((l) => (
                    <tr key={l.id}>
                      <th scope="row">
                        <Link to={`/taller/historial/${l.id}`}>{formatearDia(l.date)}</Link>
                      </th>
                      <td>{l.mechanic.name}</td>
                      <td className="tabla__numero">{l.services_count}</td>
                      <td className="tabla__numero">{formatearPesos(l.labor_total)}</td>
                      <td className="tabla__numero">
                        {formatearPesos(l.amount)}
                        <span className="tabla__detalle">
                          {l.percentage} % · {l.method_label}
                        </span>
                      </td>
                      <td>
                        {l.created_by}
                        <span className="tabla__detalle">{formatearFechaHora(l.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              etiqueta="Páginas de liquidaciones"
              pagina={filtros.page ?? 1}
              total={liquidaciones.data.count}
              hayAnterior={Boolean(liquidaciones.data.previous)}
              haySiguiente={Boolean(liquidaciones.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
            />
          </>
        ))}
    </>
  )
}

/** Una liquidación, para revisarla o reimprimirla. */
export function DetalleDeLiquidacion() {
  const id = Number(useParams().id)
  const liquidacion = useQuery({ queryKey: [...claves.liquidaciones, 'detalle', id], queryFn: ({ signal }) => obtenerLiquidacion(id, signal) })
  if (liquidacion.isPending) return <Cargando />
  if (liquidacion.isError) return <ErrorDeCarga error={liquidacion.error} onReintentar={() => void liquidacion.refetch()} />
  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Liquidación de {liquidacion.data.mechanic.name}</Titulo>
        <Link to="/taller/historial">Volver al historial</Link>
      </div>
      <HojaDeLiquidacion liquidacion={liquidacion.data} />
    </>
  )
}
