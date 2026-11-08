import { Plus } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { listarCompras, listarProveedores, type FiltrosDeCompras } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { PaymentStatus, PurchaseStatus } from '../../api/types'
import { BarraDeFiltros, BotonDeFiltro, ListaDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { PanelLateral } from '../../components/PanelLateral'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { RegistroVacio } from '../../components/Registro'
import { useAtajo } from '../../hooks/useAtajo'
import { useConteo } from '../../hooks/useConteo'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useHoy } from '../../hooks/useHoy'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { PanelDeCompra } from './DetalleDeCompra'
import { FichaDeCompra } from './FichaDeCompra'
import { ESTADO_DE_PAGO } from './etiquetas'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FormularioDeCompra } from './FormularioDeCompra'

const ESTADOS: readonly { valor: PurchaseStatus | undefined; texto: string }[] = [
  { valor: undefined, texto: 'Todas' },
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

/** Abre con todas las fechas, como antes. */
const PERIODO_INICIAL: Periodo = 'todas'

/** Los filtros viven en la dirección: sirven los enlaces y el botón «atrás». */
function leerFiltros(params: URLSearchParams, hoy: string, porPagina: number): FiltrosDeCompras & { periodo: Periodo } {
  const proveedor = Number(params.get('supplier'))
  const pagina = Number(params.get('page'))
  const pagos = params.get('payment_status')
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  return {
    periodo,
    supplier: Number.isInteger(proveedor) && proveedor > 0 ? proveedor : undefined,
    status: (params.get('status') || undefined) as PurchaseStatus | undefined,
    payment_status: pagos ? (pagos.split(',') as PaymentStatus[]) : undefined,
    ...rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined }),
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
    page_size: porPagina,
  }
}

/**
 * Con `nueva`, la lista se muestra con el panel de compra nueva abierto (ruta `/compras/lista/nueva`); con un id en la
 * dirección (`/compras/lista/15`), con esa compra abierta en el panel amplio.
 */
export function ListaDeCompras({ nueva = false }: { nueva?: boolean }) {
  const [params, setParams] = useSearchParams()
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso
  const idAbierta = Number(useParams().id)
  const compraAbierta = Number.isInteger(idAbierta) && idAbierta > 0
  const hoy = useHoy()
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const filtros = leerFiltros(params, hoy, porPagina)
  const { periodo, ...consulta } = filtros
  const busqueda = params.toString() ? `?${params.toString()}` : ''

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

  const proveedores = useQuery({
    queryKey: [...claves.proveedores, { include_inactive: true }],
    queryFn: ({ signal }) => listarProveedores({ include_inactive: true }, signal),
  })
  const compras = useQuery({
    queryKey: [...claves.compras, consulta],
    queryFn: ({ signal }) => listarCompras(consulta, signal),
    placeholderData: keepPreviousData,
  })
  const seleccion = useSeleccion(compras.data?.results, (compra) => compra.id)
  const hayFiltros = Boolean(filtros.supplier || filtros.status || filtros.payment_status || periodo !== PERIODO_INICIAL)
  const navegar = useNavigate()
  const volverALaLista = () => navegar(`/compras/lista${busqueda}`)
  useAtajo('n', () => navegar('/compras/lista/nueva'))

  // Cifras exactas: el total de cada consulta. La API filtra las fechas por el día de creación, no el de recepción,
  // así que se cuenta lo recibido que falta por pagar, que sí es exacto.
  const borradores = useConteo([...claves.compras, 'borradores'], (signal) => listarCompras({ status: 'draft', page_size: 1 }, signal))
  const porPagar = useConteo([...claves.compras, 'por-pagar'], (signal) =>
    listarCompras({ status: 'received', payment_status: ['pending', 'partial'], page_size: 1 }, signal),
  )

  return (
    <div className="vista-libro">
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
      {/* Con una compra abierta, el aviso de llegada (por ejemplo, «Borrador creado») lo muestra su panel. */}
      {aviso && !compraAbierta && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}

      <BarraDeFiltros>
        <FiltroDePeriodo
          periodo={periodo}
          desde={params.get('date_from') ?? ''}
          hasta={params.get('date_to') ?? ''}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        <div className="barra-de-filtros__grupo" role="group" aria-label="Estado">
          {ESTADOS.map((e) => (
            <BotonDeFiltro key={e.texto} activo={filtros.status === e.valor} onClick={() => cambiar({ status: e.valor })}>
              {e.texto}
            </BotonDeFiltro>
          ))}
        </div>
        <ListaDeFiltro etiqueta="Proveedor" valor={filtros.supplier ? String(filtros.supplier) : ''} onCambiar={(p) => cambiar({ supplier: p || undefined })}>
          <option value="">Todos</option>
          {(proveedores.data ?? []).map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </ListaDeFiltro>
        <ListaDeFiltro etiqueta="Pago" valor={filtros.payment_status?.join(',') ?? ''} onCambiar={(pago) => cambiar({ payment_status: pago || undefined })}>
          {PAGOS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.texto}
            </option>
          ))}
        </ListaDeFiltro>
        {compras.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {compras.data.count === 1 ? '1 compra' : `${formatearNumero(compras.data.count)} compras`}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de compras">
          {compras.isPending && <Cargando />}
          {compras.isError && <ErrorDeCarga error={compras.error} onReintentar={() => void compras.refetch()} />}
          {compras.isSuccess &&
            (compras.data.count === 0 ? (
              <EstadoVacio
                icono={DESTINOS.comprasLista.icono}
                mensaje={hayFiltros ? 'Ninguna compra coincide con los filtros.' : 'Todavía no hay compras. Crea la primera con «Nueva compra».'}
              />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-compras">
                <p id="ayuda-compras" className="solo-lectores">
                  Usa las flechas para ver el resumen de cada compra.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Compras</caption>
                  <thead>
                    <tr>
                      <th scope="col">Compra</th>
                      <th scope="col" className="libro__secundaria">
                        Fecha
                      </th>
                      <th scope="col">Proveedor</th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                      <th scope="col" className="tabla__numero">
                        Saldo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {compras.data.results.map((compra) => (
                      <tr
                        key={compra.id}
                        className="tabla__fila--elegible"
                        aria-selected={seleccion.elegido?.id === compra.id}
                        onClick={seleccion.alHacerClic(compra)}
                      >
                        <th scope="row">
                          <Link to={`/compras/lista/${compra.id}${busqueda}`}>{compra.document_number || `Compra n.º ${compra.id}`}</Link>
                          {/* Estado y productos debajo, en una línea, para que la fila no se corra. */}
                          <span className="tabla__detalle">
                            {compra.status === 'draft' ? <span className="libro__alerta">Borrador</span> : compra.status_label}
                            {' · '}
                            {compra.items_count === 1 ? '1 producto' : `${compra.items_count} productos`}
                          </span>
                        </th>
                        <td className="tabla__nowrap libro__secundaria">{formatearFechaHora(compra.created_at)}</td>
                        <td>{compra.supplier.name}</td>
                        <td className="tabla__numero">{formatearPesos(compra.total)}</td>
                        <td className="tabla__numero">
                          {compra.status === 'draft' ? '—' : formatearPesos(compra.balance_due)}
                          {compra.payment_status && <span className="tabla__detalle">{ESTADO_DE_PAGO[compra.payment_status]}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {compras.isSuccess && (
            <Paginacion
              etiqueta="Páginas de compras"
              pagina={filtros.page ?? 1}
              total={compras.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(compras.data.previous)}
              haySiguiente={Boolean(compras.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
        {seleccion.elegido ? (
          <FichaDeCompra compra={seleccion.elegido} abrir={`/compras/lista/${seleccion.elegido.id}${busqueda}`} onCerrar={seleccion.cerrar} />
        ) : (
          <RegistroVacio mensaje="Elige una compra para ver su resumen." />
        )}
      </div>
      {nueva && (
        <PanelLateral
          titulo="Nueva compra"
          modulo="Compras"
          descripcion="Se guarda como borrador: no toca el inventario hasta que la recibas."
          ancho="amplio"
          onCerrar={volverALaLista}
        >
          <FormularioDeCompra onCancelar={volverALaLista} />
        </PanelLateral>
      )}
      {compraAbierta && <PanelDeCompra key={idAbierta} id={idAbierta} onCerrar={volverALaLista} />}
    </div>
  )
}
