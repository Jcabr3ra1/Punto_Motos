import { SlidersHorizontal, Wrench } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { listarMovimientos, type FiltrosDeMovimientos } from '../../api/inventario'
import { claves } from '../../api/consultas'
import { obtenerProducto } from '../../api/productos'
import type { InventoryMovement, MovementKind, Product } from '../../api/types'
import { useUsuario } from '../../auth/useUsuario'
import { BuscadorDeProductos } from '../../components/BuscadorDeProductos'
import { BarraDeFiltros, ListaDeFiltro } from '../../components/BarraDeFiltros'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { PanelLateral } from '../../components/PanelLateral'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { useConteo } from '../../hooks/useConteo'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearConSigno, formatearNumero } from '../../utilidades/numeros'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { ConsumoDelTaller } from './ConsumoDelTaller'
import { FormularioDeAjuste } from './FormularioDeAjuste'
import { EstadoVacio } from '../../components/EstadoVacio'
import { useHoy } from '../../hooks/useHoy'

const TIPOS: readonly { valor: '' | MovementKind; texto: string }[] = [
  { valor: '', texto: 'Todos los tipos' },
  { valor: 'initial_count', texto: 'Inventario inicial' },
  { valor: 'purchase', texto: 'Compra' },
  { valor: 'sale', texto: 'Venta' },
  { valor: 'return', texto: 'Devolución' },
  { valor: 'adjustment', texto: 'Ajuste' },
  { valor: 'consignment_out', texto: 'Entrega en consignación' },
  { valor: 'consignment_return', texto: 'Devolución de consignación' },
  { valor: 'workshop_use', texto: 'Consumo del taller' },
]

/** Abre con todas las fechas: el kárdex de un producto (enlace desde Productos) debe verse completo. */
const PERIODO_INICIAL: Periodo = 'todas'

/** Los filtros viven en la dirección (`?product=7&kind=adjustment`): sirven los enlaces y el botón «atrás». */
function leerFiltros(params: URLSearchParams, hoy: string, porPagina: number): FiltrosDeMovimientos & { periodo: Periodo } {
  const producto = Number(params.get('product'))
  const pagina = Number(params.get('page'))
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  return {
    periodo,
    product: Number.isInteger(producto) && producto > 0 ? producto : undefined,
    kind: (params.get('kind') || undefined) as MovementKind | undefined,
    ...rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined }),
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
    page_size: porPagina,
  }
}

// Kárdex: todos consultan; solo el dueño ajusta existencias. Los movimientos no se editan ni se borran.
export function Movimientos() {
  const esDueno = useUsuario().role === 'owner'
  const [params, setParams] = useSearchParams()
  const [ajustando, setAjustando] = useState(false)
  const [consumiendo, setConsumiendo] = useState(false)
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
    // Cualquier filtro nuevo vuelve a la primera página; solo cambiar de página la conserva.
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  function elegirPeriodo(valor: Periodo) {
    cambiar({
      periodo: valor === PERIODO_INICIAL ? undefined : valor,
      ...(valor === 'fechas' ? {} : { date_from: undefined, date_to: undefined }),
    })
  }

  const movimientos = useQuery({
    queryKey: [...claves.movimientos, consulta],
    queryFn: ({ signal }) => listarMovimientos(consulta, signal),
    placeholderData: keepPreviousData,
  })
  const producto = useQuery({
    queryKey: claves.producto(filtros.product ?? 0),
    queryFn: ({ signal }) => obtenerProducto(filtros.product!, signal),
    enabled: filtros.product !== undefined,
  })

  const hayFiltros = Boolean(filtros.product || filtros.kind || periodo !== PERIODO_INICIAL)
  const deHoy = useConteo([...claves.movimientos, 'hoy', hoy], (signal) =>
    listarMovimientos({ date_from: hoy, date_to: hoy, page_size: 1 }, signal),
  )

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.movimientos.icono}
        titulo="Movimientos de inventario"
        descripcion="Entradas y salidas de unidades. Un error se corrige con otro movimiento."
        acciones={
          esDueno && (
            <div className="acciones">
              <button
                type="button"
                className="boton boton--secundario boton--auto"
                onClick={() => {
                  setAviso(null)
                  setConsumiendo(true)
                }}
              >
                <Wrench aria-hidden="true" size={16} />
                Consumo del taller
              </button>
              <button
                type="button"
                className="boton boton--auto"
                onClick={() => {
                  setAviso(null)
                  setAjustando(true)
                }}
              >
                <SlidersHorizontal aria-hidden="true" size={16} />
                Ajustar existencia
              </button>
            </div>
          )
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Movimientos de hoy', valor: formatearNumero(deHoy.data ?? 0), cargando: deHoy.isPending, error: deHoy.isError },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}

      <BarraDeFiltros>
        <div className="barra-de-filtros__producto">
          {filtros.product ? (
            <FiltroDeProducto
              id={filtros.product}
              producto={producto.data}
              cargando={producto.isPending}
              onQuitar={() => cambiar({ product: undefined })}
            />
          ) : (
            <BuscadorDeProductos
              etiqueta="Filtrar por producto"
              incluirAgotados
              onElegir={(elegido) => cambiar({ product: String(elegido.id) })}
            />
          )}
        </div>
        <FiltroDePeriodo
          periodo={periodo}
          desde={params.get('date_from') ?? ''}
          hasta={params.get('date_to') ?? ''}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        <ListaDeFiltro etiqueta="Tipo" valor={filtros.kind ?? ''} onCambiar={(tipo) => cambiar({ kind: tipo || undefined })}>
          {TIPOS.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.texto}
            </option>
          ))}
        </ListaDeFiltro>
        {movimientos.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {movimientos.data.count === 1 ? '1 movimiento' : `${formatearNumero(movimientos.data.count)} movimientos`}
          </p>
        )}
      </BarraDeFiltros>

      {/* Sin detalle por fila: el libro va sin registro, a todo el ancho. */}
      <div className="libro libro--sin-registro">
        <section ref={lista} className="libro__lista" aria-label="Lista de movimientos">
          {movimientos.isPending && <Cargando />}
          {movimientos.isError && <ErrorDeCarga error={movimientos.error} onReintentar={() => void movimientos.refetch()} />}
          {movimientos.isSuccess &&
            (movimientos.data.count === 0 ? (
              <EstadoVacio
                icono={DESTINOS.movimientos.icono}
                mensaje={hayFiltros ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos.'}
              />
            ) : (
              <TablaDeMovimientos movimientos={movimientos.data.results} esDueno={esDueno} />
            ))}
          {movimientos.isSuccess && (
            <Paginacion
              etiqueta="Páginas de movimientos"
              pagina={filtros.page ?? 1}
              total={movimientos.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(movimientos.data.previous)}
              haySiguiente={Boolean(movimientos.data.next)}
              onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
      </div>
      {consumiendo && (
        <PanelLateral
          titulo="Consumo del taller"
          modulo="Inventario"
          descripcion="Insumos que el taller gasta: salen del inventario sin venderse."
          onCerrar={() => setConsumiendo(false)}
        >
          <ConsumoDelTaller
            onTerminar={(mensaje) => {
              setAviso(mensaje)
              setConsumiendo(false)
            }}
            onCancelar={() => setConsumiendo(false)}
          />
        </PanelLateral>
      )}
      {ajustando && (
        <PanelLateral
          titulo="Ajustar existencia"
          modulo="Inventario"
          descripcion="El movimiento queda en el kárdex y no se puede editar."
          onCerrar={() => setAjustando(false)}
        >
          <FormularioDeAjuste
            productoInicial={producto.data}
            onTerminar={(mensaje) => {
              setAviso(mensaje)
              setAjustando(false)
            }}
            onCancelar={() => setAjustando(false)}
          />
        </PanelLateral>
      )}
    </section>
  )
}

function FiltroDeProducto({
  id,
  producto,
  cargando,
  onQuitar,
}: {
  id: number
  producto: Product | undefined
  cargando: boolean
  onQuitar: () => void
}) {
  return (
    <div className="campo">
      <span className="filtro-de-producto__etiqueta">Producto</span>
      <p className="filtro-de-producto">
        <span>
          {producto ? (
            <>
              <span className="tabla__codigo">{producto.code}</span> {producto.name}
            </>
          ) : cargando ? (
            'Cargando producto…'
          ) : (
            `Producto n.º ${id}`
          )}
        </span>
        <button type="button" className="boton-enlace" onClick={onQuitar}>
          Quitar filtro
        </button>
      </p>
    </div>
  )
}

function TablaDeMovimientos({ movimientos, esDueno }: { movimientos: InventoryMovement[]; esDueno: boolean }) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Movimientos de inventario</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Producto</th>
            <th scope="col">Tipo</th>
            <th scope="col" className="tabla__numero">
              Cantidad
            </th>
            <th scope="col" className="tabla__numero">
              Quedó
            </th>
            {/* El vendedor no recibe el costo unitario: la columna no existe para él. */}
            {esDueno && (
              <th scope="col" className="tabla__numero">
                Costo unitario
              </th>
            )}
            <th scope="col">Motivo</th>
            <th scope="col" className="libro__secundaria">
              Hecho por
            </th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((movimiento) => (
            <tr key={movimiento.id}>
              <td className="tabla__nowrap">{formatearFechaHora(movimiento.created_at)}</td>
              <td>
                {movimiento.product.name}
                <span className="tabla__detalle tabla__codigo">{movimiento.product.code}</span>
              </td>
              <td>{movimiento.kind_label}</td>
              {/* El signo (+ / -) va en el texto: el color solo refuerza, no es la única señal. */}
              <td className={`tabla__numero ${movimiento.quantity > 0 ? 'cantidad--entra' : 'cantidad--sale'}`}>
                {formatearConSigno(movimiento.quantity)}
              </td>
              <td className="tabla__numero">{formatearNumero(movimiento.balance_after)}</td>
              {esDueno && (
                <td className="tabla__numero">
                  {movimiento.unit_cost == null ? '—' : formatearPesos(movimiento.unit_cost)}
                </td>
              )}
              <td className="libro__recortado" title={movimiento.reason || undefined}>
                {movimiento.reason || '—'}
              </td>
              <td className="libro__secundaria">{movimiento.created_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
