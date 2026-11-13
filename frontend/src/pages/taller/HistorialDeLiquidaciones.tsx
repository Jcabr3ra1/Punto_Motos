import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import { listarLiquidaciones, listarMecanicos, obtenerLiquidacion } from '../../api/taller'
import { BarraDeFiltros, ListaDeFiltro } from '../../components/BarraDeFiltros'
import { BotonExportarExcel } from '../../components/BotonExportarExcel'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { RegistroVacio } from '../../components/Registro'
import { VentanaDeDocumento } from '../../components/VentanaDeDocumento'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { useConteo } from '../../hooks/useConteo'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useHoy } from '../../hooks/useHoy'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { exportarExcel, todasLasPaginas } from '../../utilidades/excel'
import { formatearDia, formatearFechaHora } from '../../utilidades/fechas'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { FichaDeLiquidacion } from './FichaDeLiquidacion'
import { HojaDeLiquidacion } from './HojaDeLiquidacion'

/** Abre con todas las fechas, como antes: las liquidaciones son pocas al día. */
const PERIODO_INICIAL: Periodo = 'todas'

/** Liquidaciones pagadas (solo el dueño), de la más reciente a la más antigua. */
export function HistorialDeLiquidaciones() {
  const [params, setParams] = useSearchParams()
  const hoy = useHoy()
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const numero = (clave: string) => {
    const valor = Number(params.get(clave))
    return Number.isInteger(valor) && valor > 0 ? valor : undefined
  }
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  const filtros = {
    mechanic: numero('mechanic'),
    ...rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined }),
    page: numero('page'),
    page_size: porPagina,
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

  function elegirPeriodo(valor: Periodo) {
    cambiar({
      periodo: valor === PERIODO_INICIAL ? undefined : valor,
      ...(valor === 'fechas' ? {} : { date_from: undefined, date_to: undefined }),
    })
  }

  const mecanicos = useQuery({ queryKey: claves.mecanicos(true), queryFn: ({ signal }) => listarMecanicos(true, signal) })
  const liquidaciones = useQuery({
    queryKey: [...claves.liquidaciones, 'historial', filtros],
    queryFn: ({ signal }) => listarLiquidaciones(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const seleccion = useSeleccion(liquidaciones.data?.results, (liquidacion) => liquidacion.id)
  const todas = useConteo([...claves.liquidaciones, 'cuantas'], (signal) => listarLiquidaciones({ page_size: 1 }, signal))
  const hayFiltros = Boolean(filtros.mechanic || periodo !== PERIODO_INICIAL)
  const [hojaAbierta, setHojaAbierta] = useState<{ id: number; mecanico: string } | null>(null)

  async function exportarLiquidaciones() {
    const todasLasLiq = await todasLasPaginas((page, page_size) => listarLiquidaciones({ ...filtros, page, page_size }))
    await exportarExcel(`liquidaciones-${hoy}`, [
      {
        nombre: 'Liquidaciones',
        encabezados: [
          'Día liquidado',
          'Pagado el',
          'Mecánico',
          'Servicios',
          'Mano de obra (COP)',
          'Porcentaje (%)',
          'Descuentos (COP)',
          'Pagado (COP)',
          'Medio',
          'Registró',
        ],
        filas: todasLasLiq.map((l) => [
          formatearDia(l.date),
          formatearFechaHora(l.created_at),
          l.mechanic.name,
          l.services_count,
          l.labor_total,
          l.percentage,
          l.deductions_total,
          l.amount,
          l.method_label,
          l.created_by,
        ]),
      },
    ])
  }

  return (
    <div className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.historialDeLiquidaciones.icono}
        titulo="Historial de liquidaciones"
        descripcion="Lo que se les pagó a los mecánicos. Elige una para ver sus servicios."
        acciones={
          <BotonExportarExcel onExportar={exportarLiquidaciones} disabled={!liquidaciones.isSuccess || liquidaciones.data.count === 0} />
        }
      />
      <FranjaDeIndicadores
        indicadores={[{ rotulo: 'Liquidaciones', valor: String(todas.data ?? 0), cargando: todas.isPending, error: todas.isError }]}
      />
      <BarraDeFiltros>
        <FiltroDePeriodo
          periodo={periodo}
          desde={params.get('date_from') ?? ''}
          hasta={params.get('date_to') ?? ''}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        <ListaDeFiltro etiqueta="Mecánico" valor={filtros.mechanic ? String(filtros.mechanic) : ''} onCambiar={(m) => cambiar({ mechanic: m || undefined })}>
          <option value="">Todos</option>
          {(mecanicos.data ?? []).map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.name}
            </option>
          ))}
        </ListaDeFiltro>
        {liquidaciones.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {liquidaciones.data.count === 1 ? '1 liquidación' : `${liquidaciones.data.count} liquidaciones`}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de liquidaciones">
          {liquidaciones.isPending && <Cargando />}
          {liquidaciones.isError && <ErrorDeCarga error={liquidaciones.error} onReintentar={() => void liquidaciones.refetch()} />}
          {liquidaciones.isSuccess &&
            (liquidaciones.data.count === 0 ? (
              <EstadoVacio icono={History} mensaje={hayFiltros ? 'Ninguna liquidación coincide con los filtros.' : 'Todavía no hay liquidaciones.'} />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-liquidaciones">
                <p id="ayuda-liquidaciones" className="solo-lectores">
                  Usa las flechas para ver el detalle de cada liquidación.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Liquidaciones pagadas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Día liquidado</th>
                      <th scope="col">Mecánico</th>
                      <th scope="col" className="tabla__numero">
                        Servicios
                      </th>
                      <th scope="col" className="tabla__numero libro__secundaria">
                        Mano de obra
                      </th>
                      <th scope="col" className="tabla__numero">
                        Pagado
                      </th>
                      <th scope="col" className="libro__secundaria">
                        Pagó
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidaciones.data.results.map((l) => (
                      <tr
                        key={l.id}
                        className="tabla__fila--elegible"
                        aria-selected={seleccion.elegido?.id === l.id}
                        onClick={seleccion.alHacerClic(l)}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="boton-enlace"
                            aria-label={`Ver la hoja del ${formatearDia(l.date)} de ${l.mechanic.name}`}
                            onClick={() => setHojaAbierta({ id: l.id, mecanico: l.mechanic.name })}
                          >
                            {formatearDia(l.date)}
                          </button>
                        </th>
                        <td>{l.mechanic.name}</td>
                        <td className="tabla__numero">{l.services_count}</td>
                        <td className="tabla__numero libro__secundaria">{formatearPesos(l.labor_total)}</td>
                        <td className="tabla__numero">
                          {formatearPesos(l.amount)}
                          <span className="tabla__detalle">
                            {l.percentage} % · {l.method_label}
                            {l.deductions_total > 0 && ` · Descuento ${formatearPesos(l.deductions_total)}`}
                          </span>
                        </td>
                        <td className="libro__secundaria">
                          {l.created_by}
                          <span className="tabla__detalle">{formatearFechaHora(l.created_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {liquidaciones.isSuccess && (
            <Paginacion
              etiqueta="Páginas de liquidaciones"
              pagina={filtros.page ?? 1}
              total={liquidaciones.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(liquidaciones.data.previous)}
              haySiguiente={Boolean(liquidaciones.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
        {seleccion.elegido ? (
          <FichaDeLiquidacion id={seleccion.elegido.id} mecanico={seleccion.elegido.mechanic.name} onCerrar={seleccion.cerrar} />
        ) : (
          <RegistroVacio mensaje="Elige una liquidación para ver sus servicios." />
        )}
      </div>
      {hojaAbierta && <VentanaDeHoja {...hojaAbierta} onCerrar={() => setHojaAbierta(null)} />}
    </div>
  )
}

/** La hoja de una liquidación del historial en una ventana emergente, sin salir de la lista. */
function VentanaDeHoja({ id, mecanico, onCerrar }: { id: number; mecanico: string; onCerrar: () => void }) {
  const liquidacion = useQuery({ queryKey: [...claves.liquidaciones, 'detalle', id], queryFn: ({ signal }) => obtenerLiquidacion(id, signal) })
  return (
    <VentanaDeDocumento titulo={`Liquidación de ${mecanico}`} onCerrar={onCerrar}>
      {liquidacion.isPending && <Cargando />}
      {liquidacion.isError && <ErrorDeCarga error={liquidacion.error} onReintentar={() => void liquidacion.refetch()} />}
      {liquidacion.data && <HojaDeLiquidacion liquidacion={liquidacion.data} />}
    </VentanaDeDocumento>
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
