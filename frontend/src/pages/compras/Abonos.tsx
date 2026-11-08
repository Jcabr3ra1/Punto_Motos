import { HandCoins } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listarAbonos, listarProveedores, type FiltrosDeAbonos } from '../../api/compras'
import { claves } from '../../api/consultas'
import { BarraDeFiltros, ListaDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { PanelLateral } from '../../components/PanelLateral'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { useConteo } from '../../hooks/useConteo'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { useDeudaConProveedores } from './useDeudaConProveedores'
import { FormularioDeAbono } from './FormularioDeAbono'
import { EstadoVacio } from '../../components/EstadoVacio'
import { useHoy } from '../../hooks/useHoy'

/** Abre con todas las fechas, como antes. */
const PERIODO_INICIAL: Periodo = 'todas'

function leerFiltros(params: URLSearchParams, hoy: string, porPagina: number): FiltrosDeAbonos & { periodo: Periodo } {
  const proveedor = Number(params.get('supplier'))
  const pagina = Number(params.get('page'))
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  return {
    periodo,
    supplier: Number.isInteger(proveedor) && proveedor > 0 ? proveedor : undefined,
    ...rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined }),
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
    page_size: porPagina,
  }
}

// Abonos a proveedores (solo el dueño), del pago más reciente al más antiguo. No se editan ni se borran.
export function Abonos() {
  const [params, setParams] = useSearchParams()
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
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

  const proveedores = useQuery({
    queryKey: [...claves.proveedores, { include_inactive: true }],
    queryFn: ({ signal }) => listarProveedores({ include_inactive: true }, signal),
  })
  const abonos = useQuery({
    queryKey: [...claves.abonos, consulta],
    queryFn: ({ signal }) => listarAbonos(consulta, signal),
    placeholderData: keepPreviousData,
  })

  const hayFiltros = Boolean(filtros.supplier || periodo !== PERIODO_INICIAL)
  const inicioDelMes = `${hoy.slice(0, 8)}01`
  const delMes = useConteo([...claves.abonos, 'mes', inicioDelMes], (signal) =>
    listarAbonos({ date_from: inicioDelMes, page_size: 1 }, signal),
  )
  const deuda = useDeudaConProveedores()

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.abonos.icono}
        titulo="Abonos a proveedores"
        descripcion="Pagos a los proveedores. Se reparten entre sus compras pendientes, de la más antigua a la más nueva."
        acciones={
          <button
            type="button"
            className="boton boton--auto boton--con-icono"
            onClick={() => {
              setAviso(null)
              setRegistrando(true)
            }}
          >
            <HandCoins aria-hidden="true" size={16} />
            Registrar abono
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Abonos este mes', valor: formatearNumero(delMes.data ?? 0), cargando: delMes.isPending, error: delMes.isError },
          { rotulo: 'Debo en total', valor: formatearPesos(deuda.total), cargando: deuda.cargando, error: deuda.error },
        ]}
      />
      {aviso && (
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
        <ListaDeFiltro etiqueta="Proveedor" valor={filtros.supplier ? String(filtros.supplier) : ''} onCambiar={(p) => cambiar({ supplier: p || undefined })}>
          <option value="">Todos</option>
          {(proveedores.data ?? []).map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </ListaDeFiltro>
        {abonos.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {abonos.data.count === 1 ? '1 abono' : `${formatearNumero(abonos.data.count)} abonos`}
          </p>
        )}
      </BarraDeFiltros>

      {/* Sin detalle por fila: cada abono dice bajo el proveedor a qué compras se aplicó. */}
      <div className="libro libro--sin-registro">
        <section ref={lista} className="libro__lista" aria-label="Lista de abonos">
          {abonos.isPending && <Cargando />}
          {abonos.isError && <ErrorDeCarga error={abonos.error} onReintentar={() => void abonos.refetch()} />}
          {abonos.isSuccess &&
            (abonos.data.count === 0 ? (
              <EstadoVacio icono={DESTINOS.abonos.icono} mensaje={hayFiltros ? 'Ningún abono coincide con los filtros.' : 'Todavía no hay abonos.'} />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Abonos a proveedores</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha de pago</th>
                      <th scope="col">Proveedor</th>
                      <th scope="col" className="tabla__numero">
                        Valor
                      </th>
                      <th scope="col" className="libro__secundaria">
                        Notas
                      </th>
                      <th scope="col" className="libro__secundaria">
                        Registró
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {abonos.data.results.map((abono) => (
                      <tr key={abono.id}>
                        <td className="tabla__nowrap">{formatearDia(abono.paid_on)}</td>
                        <td
                          title={abono.allocations
                            .map((r) => `${r.document_number || `Compra n.º ${r.purchase}`}: ${formatearPesos(r.amount)}`)
                            .join(', ')}
                        >
                          {abono.supplier.name}
                          {/* A qué compras se aplicó, en una línea bajo el proveedor; los montos, en el title. */}
                          {abono.allocations.length > 0 && (
                            <span className="tabla__detalle">
                              Aplicado a{' '}
                              {abono.allocations.map((reparto, indice) => (
                                <span key={reparto.purchase}>
                                  {indice > 0 && (indice === abono.allocations.length - 1 ? ' y ' : ', ')}
                                  <Link to={`/compras/lista/${reparto.purchase}`}>{reparto.document_number || `Compra n.º ${reparto.purchase}`}</Link>
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="tabla__numero">
                          {formatearPesos(abono.amount)}
                          <span className="tabla__detalle">{abono.method_label}</span>
                        </td>
                        <td className="libro__secundaria libro__recortado" title={abono.notes || undefined}>
                          {abono.notes || '—'}
                        </td>
                        <td className="libro__secundaria">{abono.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {abonos.isSuccess && (
            <Paginacion
              etiqueta="Páginas de abonos"
              pagina={filtros.page ?? 1}
              total={abonos.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(abonos.data.previous)}
              haySiguiente={Boolean(abonos.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
      </div>
      {registrando && (
        <PanelLateral
          titulo="Registrar abono"
          modulo="Compras"
          descripcion="Pago a un proveedor; se reparte entre sus compras con saldo."
          onCerrar={() => setRegistrando(false)}
        >
          <FormularioDeAbono
            proveedorId={filtros.supplier}
            onTerminar={(mensaje) => {
              setAviso(mensaje)
              setRegistrando(false)
            }}
            onCancelar={() => setRegistrando(false)}
          />
        </PanelLateral>
      )}
    </section>
  )
}
