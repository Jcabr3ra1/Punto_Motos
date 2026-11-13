import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowLeftRight, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { listarMotos, listarTipos } from '../../api/catalogo'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { editarProducto, eliminarProducto, listarProductos, type OrdenDeProductos } from '../../api/productos'
import type { Product } from '../../api/types'
import { DialogoDeConfirmacion } from '../../components/DialogoDeConfirmacion'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BarraDeFiltros, BotonDeFiltro, ListaDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { RegistroVacio } from '../../components/Registro'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useDebounce } from '../../hooks/useDebounce'
import { useSeleccion } from '../../hooks/useSeleccion'
import { FichaDeProducto } from './FichaDeProducto'
import type { EstadoDeFiltros } from './filtros'
import { formatearPesos } from '../../utilidades/dinero'
import { EstadoVacio } from '../../components/EstadoVacio'
import { DESTINOS } from '../../navegacion/destinos'

const ORDENES: readonly { valor: OrdenDeProductos; texto: string }[] = [
  { valor: 'name', texto: 'Nombre (A a Z)' },
  { valor: 'code', texto: 'Código' },
  { valor: 'sale_price', texto: 'Precio: de menor a mayor' },
  { valor: '-sale_price', texto: 'Precio: de mayor a menor' },
  { valor: '-updated_at', texto: 'Cambiados recientemente' },
]

interface Props {
  filtros: EstadoDeFiltros
  onCambiarFiltros: (filtros: EstadoDeFiltros) => void
  esDueno: boolean
  onEditar: (producto: Product) => void
  onAviso?: (mensaje: string | null) => void
}

export function ListaDeProductos({ filtros, onCambiarFiltros, esDueno, onEditar, onAviso }: Props) {
  const clienteDeConsultas = useQueryClient()
  const [eliminando, setEliminando] = useState<Product | null>(null)
  // Cualquier cambio de filtro vuelve a la primera página; solo cambiar de página la conserva.
  const cambiar = (parcial: Partial<EstadoDeFiltros>) => onCambiarFiltros({ ...filtros, pagina: 1, ...parcial })

  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)

  const tipos = useQuery({ queryKey: claves.catalogoActivo('categories'), queryFn: ({ signal }) => listarTipos(signal) })
  const motos = useQuery({ queryKey: claves.catalogoActivo('motos'), queryFn: ({ signal }) => listarMotos(signal) })

  // El texto se envía al backend con una pausa corta, no con cada tecla.
  const busqueda = useDebounce(filtros.busqueda)
  const consultaDeProductos = {
    q: busqueda,
    category: filtros.tipo ? Number(filtros.tipo) : undefined,
    moto: filtros.moto ? Number(filtros.moto) : undefined,
    workshop_supply: filtros.insumos,
    include_inactive: filtros.desactivados,
    ordering: filtros.orden,
    page: filtros.pagina,
    page_size: porPagina,
  }
  const productos = useQuery({
    queryKey: [...claves.productos, consultaDeProductos],
    queryFn: ({ signal }) => listarProductos(consultaDeProductos, signal),
    // Mientras llega la página nueva se sigue mostrando la anterior, sin parpadeo.
    placeholderData: keepPreviousData,
  })

  const hayFiltros = Boolean(busqueda || filtros.tipo || filtros.moto || filtros.insumos)
  const seleccion = useSeleccion(productos.data?.results, (producto) => producto.id)

  const invalidarProducto = async (id: number) => {
    await Promise.all(
      [claves.productos, ['buscador'], claves.producto(id)].map((queryKey) => clienteDeConsultas.invalidateQueries({ queryKey })),
    )
  }

  const eliminar = useMutation({
    mutationFn: (producto: Product) => eliminarProducto(producto.id),
    onSuccess: async (_, borrado) => {
      setEliminando(null)
      onAviso?.(`Producto «${borrado.name}» eliminado.`)
      await invalidarProducto(borrado.id)
    },
  })

  const desactivar = useMutation({
    mutationFn: (producto: Product) => editarProducto(producto.id, { is_active: false }),
    onSuccess: async (desactivado) => {
      setEliminando(null)
      onAviso?.(`Producto «${desactivado.name}» desactivado.`)
      await invalidarProducto(desactivado.id)
    },
  })

  const fallo = desactivar.error ?? eliminar.error
  const error = fallo ? desglosarError(fallo) : null
  const tieneHistorial = isApiError(eliminar.error) && eliminar.error.code === 'product_has_history'

  return (
    <>
      <BarraDeFiltros
        busqueda={{
          etiqueta: 'Buscar',
          placeholder: 'Código, nombre o moto',
          valor: filtros.busqueda,
          onCambiar: (valor) => cambiar({ busqueda: valor }),
        }}
      >
        <ListaDeFiltro etiqueta="Tipo" valor={filtros.tipo} onCambiar={(tipo) => cambiar({ tipo })}>
          <option value="">Todos</option>
          {(tipos.data ?? []).map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </ListaDeFiltro>
        <ListaDeFiltro etiqueta="Moto" valor={filtros.moto} onCambiar={(moto) => cambiar({ moto })}>
          <option value="">Todas</option>
          {(motos.data ?? []).map((m) => (
            <option key={m.id} value={String(m.id)}>
              {m.name}
            </option>
          ))}
        </ListaDeFiltro>
        <div className="barra-de-filtros__grupo">
          <BotonDeFiltro activo={filtros.insumos} onClick={() => cambiar({ insumos: !filtros.insumos })}>
            Insumos de taller
          </BotonDeFiltro>
          {esDueno && (
            <BotonDeFiltro activo={filtros.desactivados} onClick={() => cambiar({ desactivados: !filtros.desactivados })}>
              Desactivados
            </BotonDeFiltro>
          )}
        </div>
        <ListaDeFiltro etiqueta="Ordenar por" valor={filtros.orden} onCambiar={(orden) => cambiar({ orden: orden as OrdenDeProductos })}>
          {ORDENES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </ListaDeFiltro>
        {productos.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {productos.data.count === 1 ? '1 producto' : `${productos.data.count} productos`}
          </p>
        )}
      </BarraDeFiltros>

      {eliminando && (
        <DialogoDeConfirmacion
          titulo={`¿Eliminar «${eliminando.name}»?`}
          accion={eliminar.isPending ? 'Eliminando…' : 'Sí, eliminar'}
          cancelar="Volver"
          peligro
          ocupado={eliminar.isPending || desactivar.isPending}
          onConfirmar={() => {
            desactivar.reset()
            eliminar.mutate(eliminando)
          }}
          onCancelar={() => {
            eliminar.reset()
            desactivar.reset()
            setEliminando(null)
          }}
          otrasAcciones={
            tieneHistorial &&
            eliminando.is_active && (
              <button
                type="button"
                className="boton boton--secundario boton--auto"
                disabled={desactivar.isPending || eliminar.isPending}
                onClick={() => desactivar.mutate(eliminando)}
              >
                {desactivar.isPending ? 'Desactivando…' : 'Desactivar producto'}
              </button>
            )
          }
        >
          <p>
            Solo se puede eliminar un producto que nunca se usó; su código ({eliminando.code}) quedará libre.
          </p>
          <AvisoDeError mensajes={error?.generales ?? []} />
        </DialogoDeConfirmacion>
      )}

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de productos">
          {productos.isPending && <Cargando />}
          {productos.isError && <ErrorDeCarga error={productos.error} onReintentar={() => void productos.refetch()} />}
          {productos.isSuccess &&
            (productos.data.count === 0 ? (
              <EstadoVacio
                icono={DESTINOS.productos.icono}
                mensaje={hayFiltros ? 'Ningún producto coincide con la búsqueda.' : esDueno ? 'Todavía no hay productos. Crea el primero con «Nuevo producto».' : 'Todavía no hay productos.'}
              />
            ) : (
              <TablaDeProductos
                productos={productos.data.results}
                esDueno={esDueno}
                elegido={seleccion.elegido}
                onElegir={seleccion.alHacerClic}
                onTeclear={seleccion.alTeclear}
                onEditar={onEditar}
                onEliminar={(producto) => {
                  onAviso?.(null)
                  eliminar.reset()
                  desactivar.reset()
                  setEliminando(producto)
                }}
              />
            ))}
          {productos.isSuccess && (
            <Paginacion
              etiqueta="Páginas de productos"
              pagina={filtros.pagina}
              total={productos.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(productos.data.previous)}
              haySiguiente={Boolean(productos.data.next)}
              onCambiar={(pagina) => onCambiarFiltros({ ...filtros, pagina })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
        {seleccion.elegido ? (
          <FichaDeProducto producto={seleccion.elegido} esDueno={esDueno} onEditar={onEditar} onCerrar={seleccion.cerrar} />
        ) : (
          <RegistroVacio mensaje="Elige un producto para ver su ficha." />
        )}
      </div>
    </>
  )
}

function TablaDeProductos({
  productos,
  esDueno,
  elegido,
  onElegir,
  onTeclear,
  onEditar,
  onEliminar,
}: {
  productos: Product[]
  esDueno: boolean
  elegido: Product | null
  onElegir: (producto: Product) => (evento: MouseEvent) => void
  onTeclear: (evento: KeyboardEvent) => void
  onEditar: (producto: Product) => void
  onEliminar: (producto: Product) => void
}) {
  return (
    <div
      className="tabla-contenedor"
      tabIndex={0}
      onKeyDown={onTeclear}
      aria-describedby="ayuda-productos"
    >
      <p id="ayuda-productos" className="solo-lectores">
        Usa las flechas para ver la ficha de cada producto.
      </p>
      <table className="tabla">
        <caption className="solo-lectores">Productos</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Producto</th>
            <th scope="col">Tipo</th>
            {/* El vendedor no recibe el costo: la columna no existe para él. */}
            {esDueno && (
              <th scope="col" className="tabla__numero col-secundaria">
                Costo
              </th>
            )}
            <th scope="col" className="tabla__numero">
              Precio
            </th>
            <th scope="col" className="tabla__numero">
              Existencia
            </th>
            <th scope="col" className="tabla__acciones">
              <span className="solo-lectores">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => (
            <tr
              key={producto.id}
              className={`tabla__fila--elegible${producto.is_active ? '' : ' tabla__fila--inactiva'}`}
              aria-selected={elegido?.id === producto.id}
              onClick={onElegir(producto)}
            >
              <th scope="row">
                <span className="tabla__codigo">{producto.code}</span>
              </th>
              <td>
                {producto.name}
                <span className="tabla__detalle">
                  {[producto.brand?.name, producto.is_universal ? 'Universal' : producto.moto?.name]
                    .filter(Boolean)
                    .join(' · ')}
                  {!producto.is_active && ' · Desactivado'}
                </span>
              </td>
              <td>
                <span className="etiqueta etiqueta--tipo">{producto.category.name}</span>
              </td>
              {esDueno && (
                <td className="tabla__numero col-secundaria">
                  {producto.cost_price === undefined ? '—' : formatearPesos(producto.cost_price)}
                </td>
              )}
              <td className="tabla__numero">
                {formatearPesos(producto.sale_price)}
                {/* Debajo del precio, como «Anulada» en Ventas, para que la fila no se corra. */}
                {producto.sells_below_cost && <span className="tabla__detalle libro__alerta">Bajo el costo</span>}
              </td>
              <td className="tabla__numero">
                <Medidor actual={producto.stock} minimo={producto.min_stock} alerta={producto.is_low_stock} />
                {/* El color del medidor ya avisa; el texto queda para el lector de pantalla. */}
                {producto.is_low_stock && <span className="solo-lectores">Reponer</span>}
              </td>
              <td className="tabla__acciones">
                {/* Iconos con su nombre en el title y para lectores: caben junto al registro sin cortar la fila.
                    Todos pueden ver el kárdex de un producto; solo el dueño lo edita o elimina. */}
                <Link
                  className="boton-icono"
                  to={`${DESTINOS.movimientos.ruta}?product=${producto.id}`}
                  aria-label={`Movimientos de ${producto.name}`}
                  title="Movimientos"
                >
                  <ArrowLeftRight aria-hidden="true" size={16} strokeWidth={1.75} />
                </Link>
                {esDueno && (
                  <>
                    <button
                      type="button"
                      className="boton-icono"
                      aria-label={`Editar ${producto.name}`}
                      title="Editar"
                      onClick={() => onEditar(producto)}
                    >
                      <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="boton-icono boton-icono--peligro"
                      aria-label={`Eliminar ${producto.name}`}
                      title="Eliminar"
                      onClick={() => onEliminar(producto)}
                    >
                      <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Existencia actual en la tabla (sin mostrar el mínimo). */
function Medidor({ actual, minimo, alerta }: { actual: number; minimo: number; alerta: boolean }) {
  const lleno = Math.max(0, Math.min(1, actual / Math.max(minimo * 2, 1)))
  return (
    <span className={`medidor${alerta ? ' medidor--alerta' : ''}`}>
      <span className="medidor__barra" aria-hidden="true">
        <span style={{ width: `${Math.round(lleno * 100)}%` }} />
      </span>
      <span>{actual}</span>
    </span>
  )
}
