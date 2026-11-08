import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import type { ReturnCause } from '../../api/types'
import { listarDevoluciones, obtenerDevolucion, type FiltrosDeDevoluciones } from '../../api/ventas'
import { BarraDeFiltros, BotonDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { RegistroVacio } from '../../components/Registro'
import { Paginacion } from '../../components/Paginacion'
import { useConteo } from '../../hooks/useConteo'
import { useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { Titulo } from '../../components/Titulo'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { ComprobanteDeDevolucion } from './ComprobanteDeDevolucion'
import { FichaDeDevolucion } from './FichaDeDevolucion'
import { useHoy } from '../../hooks/useHoy'

/** Las devoluciones son pocas: la lista abre con todas las fechas en lugar de solo hoy. */
const PERIODO_INICIAL: Periodo = 'todas'

/** Medidas del libro (ver Ventas): filas de 48px, cabecera de 36px, pie de 48px y bordes. */
const MEDIDAS_DEL_LIBRO = { fila: 48, fijo: 36 + 48 + 2, porDefecto: 20 }

const CAUSAS: readonly { valor: ReturnCause | undefined; texto: string }[] = [
  { valor: undefined, texto: 'Todas' },
  { valor: 'other', texto: 'Otra causa' },
  { valor: 'bad_service', texto: 'Mal servicio' },
]

function leerFiltros(params: URLSearchParams, hoy: string, porPagina: number): FiltrosDeDevoluciones & { periodo: Periodo } {
  const numero = Number(params.get('number'))
  const venta = Number(params.get('sale'))
  const pagina = Number(params.get('page'))
  const causa = params.get('cause')
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  const conNumero = Number.isInteger(numero) && numero > 0 ? numero : undefined
  // Con un número de devolución se busca en todas las fechas, como el recibo en Ventas.
  const rango = conNumero
    ? {}
    : rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined })
  return {
    periodo,
    number: conNumero,
    sale: Number.isInteger(venta) && venta > 0 ? venta : undefined,
    cause: causa === 'bad_service' || causa === 'other' ? (causa as ReturnCause) : undefined,
    ...rango,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
    page_size: porPagina,
  }
}

/** Historial de devoluciones (todos los roles), de la más reciente a la más antigua. */
export function Devoluciones() {
  const [params, setParams] = useSearchParams()
  const hoy = useHoy()
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const filtros = leerFiltros(params, hoy, porPagina)
  const { periodo, ...consulta } = filtros

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

  const devoluciones = useQuery({
    queryKey: [...claves.devoluciones, consulta],
    queryFn: ({ signal }) => listarDevoluciones(consulta, signal),
    placeholderData: keepPreviousData,
  })
  const seleccion = useSeleccion(devoluciones.data?.results, (devolucion) => devolucion.id)
  const deHoy = useConteo([...claves.devoluciones, 'hoy', hoy], (signal) =>
    listarDevoluciones({ date_from: hoy, date_to: hoy, page_size: 1 }, signal),
  )

  const otrosFiltros = Boolean(filtros.sale || filtros.cause)
  const sinDevoluciones = filtros.number
    ? 'Ninguna devolución tiene ese número.'
    : otrosFiltros
      ? 'Ninguna devolución coincide con los filtros.'
      : periodo === 'todas'
        ? 'Todavía no hay devoluciones.'
        : periodo === 'hoy'
          ? 'Hoy no hay devoluciones.'
          : 'No hay devoluciones en esas fechas.'

  return (
    <div className="vista-libro">
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
      <BarraDeFiltros
        busqueda={{
          etiqueta: 'N.º de devolución',
          placeholder: 'N.º de devolución',
          valor: params.get('number') ?? '',
          onCambiar: (valor) => cambiar({ number: valor.replace(/\D/g, '') || undefined }),
        }}
      >
        <FiltroDePeriodo
          periodo={periodo}
          desde={params.get('date_from') ?? ''}
          hasta={params.get('date_to') ?? ''}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        <div className="barra-de-filtros__grupo" role="group" aria-label="Causa">
          {CAUSAS.map((c) => (
            <BotonDeFiltro key={c.texto} activo={filtros.cause === c.valor} onClick={() => cambiar({ cause: c.valor })}>
              {c.texto}
            </BotonDeFiltro>
          ))}
        </div>
        {devoluciones.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {devoluciones.data.count === 1 ? '1 devolución' : `${formatearNumero(devoluciones.data.count)} devoluciones`}
            {filtros.number ? ' · en todas las fechas' : ''}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de devoluciones">
          {devoluciones.isPending && <Cargando />}
          {devoluciones.isError && <ErrorDeCarga error={devoluciones.error} onReintentar={() => void devoluciones.refetch()} />}
          {devoluciones.isSuccess &&
            (devoluciones.data.count === 0 ? (
              <EstadoVacio icono={Undo2} mensaje={sinDevoluciones} />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-devoluciones">
                <p id="ayuda-devoluciones" className="solo-lectores">
                  Usa las flechas para ver el detalle de cada devolución.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Devoluciones</caption>
                  <thead>
                    <tr>
                      <th scope="col">Devolución</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Cliente</th>
                      <th scope="col">Causa</th>
                      <th scope="col" className="libro__secundaria">
                        Registró
                      </th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {devoluciones.data.results.map((d) => (
                      <tr
                        key={d.id}
                        className="tabla__fila--elegible"
                        aria-selected={seleccion.elegido?.id === d.id}
                        onClick={seleccion.alHacerClic(d)}
                      >
                        <th scope="row">
                          <Link to={`/venta/devoluciones/${d.id}`} className="tabla__codigo">
                            N.º {d.number}
                          </Link>
                          {/* La venta va debajo, como «Anulada» en Ventas, para no correr la fila. */}
                          <span className="tabla__detalle">
                            <Link to={`/venta/historial/${d.sale}`}>Venta n.º {d.sale_number}</Link>
                          </span>
                        </th>
                        <td className="tabla__nowrap">{formatearFechaHora(d.created_at)}</td>
                        <td>
                          {d.customer?.name ?? 'Sin cliente'}
                          {d.customer?.phone && <span className="tabla__detalle">{d.customer.phone}</span>}
                        </td>
                        <td className="libro__recortado" title={d.reason ? `${d.cause_label}: ${d.reason}` : d.cause_label}>
                          {d.cause_label}
                          <span className="tabla__detalle">{d.reason}</span>
                        </td>
                        <td className="libro__secundaria">{d.created_by}</td>
                        <td className="tabla__numero">{formatearPesos(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {devoluciones.isSuccess && (
            <Paginacion
              etiqueta="Páginas de devoluciones"
              pagina={filtros.page ?? 1}
              total={devoluciones.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(devoluciones.data.previous)}
              haySiguiente={Boolean(devoluciones.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
        {seleccion.elegido ? (
          <FichaDeDevolucion id={seleccion.elegido.id} numero={seleccion.elegido.number} onCerrar={seleccion.cerrar} />
        ) : (
          <RegistroVacio mensaje="Elige una devolución para ver su detalle." />
        )}
      </div>
    </div>
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
