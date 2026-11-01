import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { listarMotos, listarTipos } from '../../api/catalogo'
import { claves } from '../../api/consultas'
import { listarProductos, type OrdenDeProductos } from '../../api/productos'
import type { Product } from '../../api/types'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Casilla } from '../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { useDebounce } from '../../hooks/useDebounce'
import type { EstadoDeFiltros } from './filtros'
import { formatearPesos } from '../../utilidades/dinero'

const TAMANO_DE_PAGINA = 50

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
}

export function ListaDeProductos({ filtros, onCambiarFiltros, esDueno, onEditar }: Props) {
  // Cualquier cambio de filtro vuelve a la primera página; solo cambiar de página la conserva.
  const cambiar = (parcial: Partial<EstadoDeFiltros>) => onCambiarFiltros({ ...filtros, pagina: 1, ...parcial })

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
  }
  const productos = useQuery({
    queryKey: [...claves.productos, consultaDeProductos],
    queryFn: ({ signal }) => listarProductos(consultaDeProductos, signal),
    // Mientras llega la página nueva se sigue mostrando la anterior, sin parpadeo.
    placeholderData: keepPreviousData,
  })

  const hayFiltros = Boolean(busqueda || filtros.tipo || filtros.moto || filtros.insumos)

  return (
    <>
      <div className="filtros" role="search" aria-label="Filtrar productos">
        <Campo
          etiqueta="Buscar"
          type="search"
          value={filtros.busqueda}
          onChange={(e) => cambiar({ busqueda: e.target.value })}
          placeholder="Código, nombre o moto"
          autoComplete="off"
        />
        <CampoSelector
          etiqueta="Tipo"
          value={filtros.tipo}
          onChange={(e) => cambiar({ tipo: e.target.value })}
          opciones={[
            { valor: '', texto: 'Todos los tipos' },
            ...(tipos.data ?? []).map((t) => ({ valor: String(t.id), texto: t.name })),
          ]}
        />
        <CampoSelector
          etiqueta="Moto"
          value={filtros.moto}
          onChange={(e) => cambiar({ moto: e.target.value })}
          opciones={[
            { valor: '', texto: 'Todas las motos' },
            ...(motos.data ?? []).map((m) => ({ valor: String(m.id), texto: m.name })),
          ]}
        />
        <CampoSelector
          etiqueta="Ordenar por"
          value={filtros.orden}
          onChange={(e) => cambiar({ orden: e.target.value as OrdenDeProductos })}
          opciones={ORDENES.map((o) => ({ valor: o.valor, texto: o.texto }))}
        />
      </div>
      <div className="filtros__casillas">
        <Casilla
          etiqueta="Solo insumos de taller"
          checked={filtros.insumos}
          onChange={(e) => cambiar({ insumos: e.target.checked })}
        />
        {esDueno && (
          <Casilla
            etiqueta="Mostrar desactivados"
            checked={filtros.desactivados}
            onChange={(e) => cambiar({ desactivados: e.target.checked })}
          />
        )}
      </div>

      {productos.isPending && <Cargando />}
      {productos.isError && <ErrorDeCarga error={productos.error} onReintentar={() => void productos.refetch()} />}

      {productos.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {productos.data.count === 1 ? '1 producto' : `${productos.data.count} productos`}
          </p>
          {productos.data.count === 0 ? (
            <p className="texto-suave">
              {hayFiltros
                ? 'Ningún producto coincide con la búsqueda.'
                : esDueno
                  ? 'Todavía no hay productos. Crea el primero con «Nuevo producto».'
                  : 'Todavía no hay productos.'}
            </p>
          ) : (
            <>
              <TablaDeProductos productos={productos.data.results} esDueno={esDueno} onEditar={onEditar} />
              <Paginacion
                etiqueta="Páginas de productos"
                pagina={filtros.pagina}
                total={productos.data.count}
                tamano={TAMANO_DE_PAGINA}
                hayAnterior={Boolean(productos.data.previous)}
                haySiguiente={Boolean(productos.data.next)}
                onCambiar={(pagina) => onCambiarFiltros({ ...filtros, pagina })}
              />
            </>
          )}
        </>
      )}
    </>
  )
}

function TablaDeProductos({
  productos,
  esDueno,
  onEditar,
}: {
  productos: Product[]
  esDueno: boolean
  onEditar: (producto: Product) => void
}) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Productos</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Producto</th>
            <th scope="col">Tipo</th>
            {/* El vendedor no recibe el costo: la columna no existe para él. */}
            {esDueno && <th scope="col">Costo</th>}
            <th scope="col">Precio</th>
            <th scope="col">Existencia</th>
            <th scope="col">
              <span className="solo-lectores">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {productos.map((producto) => (
            <tr key={producto.id} className={producto.is_active ? undefined : 'tabla__fila--inactiva'}>
              <th scope="row" className="tabla__codigo">
                {producto.code}
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
              <td>{producto.category.name}</td>
              {esDueno && <td>{producto.cost_price === undefined ? '—' : formatearPesos(producto.cost_price)}</td>}
              <td>
                {formatearPesos(producto.sale_price)}
                {producto.sells_below_cost && <span className="etiqueta etiqueta--alerta">Bajo el costo</span>}
              </td>
              <td>
                {producto.stock}
                {producto.is_low_stock && <span className="etiqueta etiqueta--alerta">Reponer</span>}
              </td>
              <td className="tabla__acciones">
                {/* Todos pueden ver el kárdex de un producto; solo el dueño lo edita. */}
                <Link
                  className="boton-enlace"
                  to={`/inventario/movimientos?product=${producto.id}`}
                  aria-label={`Movimientos de ${producto.name}`}
                >
                  Movimientos
                </Link>
                {esDueno && (
                  <button
                    type="button"
                    className="boton-enlace"
                    aria-label={`Editar ${producto.name}`}
                    onClick={() => onEditar(producto)}
                  >
                    Editar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
