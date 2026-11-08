import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, ReceiptText } from 'lucide-react'
import { useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import { listarMecanicos } from '../../api/taller'
import { listarVentas, type FiltrosDeVentas } from '../../api/ventas'
import { BarraDeFiltros, BotonDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { RegistroVacio } from '../../components/Registro'
import { useAtajo } from '../../hooks/useAtajo'
import { useConteo } from '../../hooks/useConteo'
import { useSeleccion } from '../../hooks/useSeleccion'
import { useVentasDeHoy } from '../../hooks/useVentasDeHoy'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { FichaDeVenta } from './FichaDeVenta'
import { useHoy } from '../../hooks/useHoy'
import { useFilasQueCaben } from '../../hooks/useFilasQueCaben'

/**
 * Medidas del libro para saber cuántas ventas enteras caben en la página: filas de 48px, más la cabecera de la tabla
 * (36px), el pie con Atrás y Siguiente (48px) y los bordes. Sin poder medir, 20 por página.
 */
const MEDIDAS_DEL_LIBRO = { fila: 48, fijo: 36 + 48 + 2, porDefecto: 20 }

const ESTADOS: readonly { valor: 'true' | 'false' | undefined; texto: string }[] = [
  { valor: undefined, texto: 'Todas' },
  { valor: 'false', texto: 'Vigentes' },
  { valor: 'true', texto: 'Anuladas' },
]

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

function leerFiltros(params: URLSearchParams, hoy: string, porPagina: number): FiltrosDeVentas & { periodo: Periodo } {
  const numero = Number(params.get('number'))
  const mecanico = Number(params.get('mechanic'))
  const pagina = Number(params.get('page'))
  const anuladas = params.get('voided')
  const periodo = leerPeriodo(params)
  const conNumero = Number.isInteger(numero) && numero > 0 ? numero : undefined
  // Quien escribe un número de recibo quiere esa venta aunque no sea del período elegido: se busca en todas las fechas.
  const rango = conNumero
    ? {}
    : rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined })
  return {
    periodo,
    number: conNumero,
    mechanic: Number.isInteger(mecanico) && mecanico > 0 ? mecanico : undefined,
    voided: anuladas === 'true' ? true : anuladas === 'false' ? false : undefined,
    ...rango,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
    page_size: porPagina,
  }
}

// Historial de ventas (todos los roles), de la más reciente a la más antigua.
export function Ventas() {
  const [params, setParams] = useSearchParams()
  const hoy = useHoy()
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const filtros = leerFiltros(params, hoy, porPagina)
  const { periodo } = filtros
  const desde = params.get('date_from') ?? ''
  const hasta = params.get('date_to') ?? ''

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
    // Hoy es el período al abrir: no se escribe en la URL. Las fechas a mano solo se guardan con «Fechas».
    cambiar({
      periodo: valor === 'hoy' ? undefined : valor,
      ...(valor === 'fechas' ? {} : { date_from: undefined, date_to: undefined }),
    })
  }

  const { periodo: _periodo, ...consulta } = filtros
  const mecanicos = useQuery({ queryKey: claves.mecanicos(true), queryFn: ({ signal }) => listarMecanicos(true, signal) })
  const ventas = useQuery({
    queryKey: [...claves.ventas, consulta],
    queryFn: ({ signal }) => listarVentas(consulta, signal),
    placeholderData: keepPreviousData,
  })
  const seleccion = useSeleccion(ventas.data?.results, (venta) => venta.id)
  const navegar = useNavigate()
  useAtajo('n', () => navegar(DESTINOS.vender.ruta))

  const deHoy = useVentasDeHoy()
  const anuladas = useConteo([...claves.ventas, 'anuladas', hoy], (signal) =>
    listarVentas({ date_from: hoy, date_to: hoy, voided: true, page_size: 1 }, signal),
  )

  const soloHora = periodo === 'hoy' && !filtros.number
  const otrosFiltros = Boolean(filtros.mechanic || filtros.voided !== undefined)
  const sinVentas = filtros.number
    ? 'Ninguna venta tiene ese número de recibo.'
    : otrosFiltros
      ? 'Ninguna venta coincide con los filtros.'
      : periodo === 'hoy'
        ? 'Todavía no hay ventas hoy.'
        : periodo === 'todas'
          ? 'Todavía no hay ventas.'
          : 'No hay ventas en esas fechas.'

  return (
    <div className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.ventas.icono}
        titulo="Ventas"
        descripcion="Lo vendido, de lo más reciente a lo más antiguo. Elige una venta para ver su recibo."
        acciones={
          <Link to={DESTINOS.vender.ruta} className="boton boton--auto boton--con-icono" aria-keyshortcuts="Control+N">
            <Plus aria-hidden="true" size={16} />
            Nueva venta
            <kbd className="atajo-visible" aria-hidden="true">Ctrl+N</kbd>
          </Link>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Ventas de hoy', valor: formatearNumero(deHoy.data?.cantidad ?? 0), cargando: deHoy.isPending, error: deHoy.isError },
          { rotulo: 'Total de hoy', valor: formatearPesos(deHoy.data?.total ?? 0), cargando: deHoy.isPending, error: deHoy.isError },
          { rotulo: 'Anuladas hoy', valor: formatearNumero(anuladas.data ?? 0), cargando: anuladas.isPending, error: anuladas.isError },
        ]}
      />
      <BarraDeFiltros
        busqueda={{
          etiqueta: 'N.º de recibo',
          placeholder: 'N.º de recibo',
          valor: filtros.number ? String(filtros.number) : (params.get('number') ?? ''),
          onCambiar: (valor) => cambiar({ number: valor.replace(/\D/g, '') || undefined }),
        }}
      >
        <FiltroDePeriodo
          periodo={periodo}
          desde={desde}
          hasta={hasta}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        <div className="barra-de-filtros__grupo" role="group" aria-label="Estado">
          {ESTADOS.map((e) => (
            <BotonDeFiltro key={e.texto} activo={params.get('voided') === (e.valor ?? null)} onClick={() => cambiar({ voided: e.valor })}>
              {e.texto}
            </BotonDeFiltro>
          ))}
        </div>
        <label className="filtro filtro--lista">
          <span aria-hidden="true">Mecánico:</span>
          <select aria-label="Mecánico" value={filtros.mechanic ? String(filtros.mechanic) : ''} onChange={(e) => cambiar({ mechanic: e.target.value || undefined })}>
            <option value="">Todos</option>
            {(mecanicos.data ?? []).map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {ventas.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {ventas.data.count === 1 ? '1 venta' : `${formatearNumero(ventas.data.count)} ventas`}
            {filtros.number ? ' · en todas las fechas' : ''}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de ventas">
          {ventas.isPending && <Cargando />}
          {ventas.isError && <ErrorDeCarga error={ventas.error} onReintentar={() => void ventas.refetch()} />}
          {ventas.isSuccess &&
            (ventas.data.count === 0 ? (
              <EstadoVacio icono={ReceiptText} mensaje={sinVentas} />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-ventas">
                <p id="ayuda-ventas" className="solo-lectores">
                  Usa las flechas para ver el recibo de cada venta.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Ventas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recibo</th>
                      <th scope="col">{soloHora ? 'Hora' : 'Fecha'}</th>
                      <th scope="col">Cliente</th>
                      <th scope="col" className="libro__secundaria">
                        Vendió
                      </th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.data.results.map((venta) => (
                      <tr
                        key={venta.id}
                        className={`tabla__fila--elegible${venta.is_voided ? ' tabla__fila--inactiva' : ''}`}
                        aria-selected={seleccion.elegido?.id === venta.id}
                        onClick={seleccion.alHacerClic(venta)}
                      >
                        <th scope="row">
                          <Link to={`/venta/historial/${venta.id}`} className="tabla__codigo">
                            N.º {venta.number}
                          </Link>
                          {/* «Anulada» y los servicios van debajo del número, en una sola línea, para no correr la fila. */}
                          {(venta.is_voided || venta.services_count > 0) && (
                            <span className="tabla__detalle">
                              {venta.is_voided && <span className="libro__anulada">Anulada</span>}
                              {venta.is_voided && venta.services_count > 0 && ' · '}
                              {venta.services_count > 0 && (venta.services_count === 1 ? '1 servicio' : `${venta.services_count} servicios`)}
                            </span>
                          )}
                        </th>
                        <td className="tabla__nowrap" title={formatearFechaHora(venta.created_at)}>
                          {soloHora ? hora(venta.created_at) : formatearFechaHora(venta.created_at)}
                        </td>
                        <td>
                          {venta.customer?.name ?? 'Sin cliente'}
                          {venta.customer?.phone && <span className="tabla__detalle">{venta.customer.phone}</span>}
                        </td>
                        <td className="libro__secundaria">{venta.created_by}</td>
                        <td className="tabla__numero">{formatearPesos(venta.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {ventas.isSuccess && (
            <Paginacion
              etiqueta="Páginas de ventas"
              pagina={filtros.page ?? 1}
              total={ventas.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(ventas.data.previous)}
              haySiguiente={Boolean(ventas.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
        {seleccion.elegido ? (
          <FichaDeVenta id={seleccion.elegido.id} numero={seleccion.elegido.number} onCerrar={seleccion.cerrar} />
        ) : (
          <RegistroVacio mensaje="Elige una venta para ver su recibo." />
        )}
      </div>
    </div>
  )
}
