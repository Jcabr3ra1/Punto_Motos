import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { listarMovimientos } from '../../api/inventario'
import type { Product } from '../../api/types'
import { Ficha } from '../../components/Ficha'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

const formatoDePorcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 0 })

/** Ganancia sobre el precio de venta: (precio − costo) / precio. */
function margen(producto: Product): string | null {
  if (producto.cost_price === undefined || producto.sale_price <= 0) return null
  return formatoDePorcentaje.format((producto.sale_price - producto.cost_price) / producto.sale_price)
}

/** Ficha de un producto junto a la lista: precio, existencia, ubicación, motos y sus últimos movimientos. */
export function FichaDeProducto({
  producto,
  esDueno,
  onEditar,
  onCerrar,
}: {
  producto: Product
  esDueno: boolean
  onEditar: (producto: Product) => void
  onCerrar: () => void
}) {
  const movimientos = useQuery({
    queryKey: [...claves.movimientos, 'producto', producto.id, 'ultimos'],
    queryFn: ({ signal }) => listarMovimientos({ product: producto.id, page_size: 5 }, signal),
  })
  const porcentaje = margen(producto)
  const motos = [producto.is_universal ? 'Universal' : producto.moto?.name, ...producto.compatible_motos.map((m) => m.name)]
    .filter(Boolean)
    .join(', ')
  return (
    <Ficha
      titulo={producto.name}
      modulo="Productos"
      onCerrar={onCerrar}
      acciones={
        <>
          {esDueno && (
            <button type="button" className="boton boton--auto" onClick={() => onEditar(producto)}>
              Editar
            </button>
          )}
          <Link to={`${DESTINOS.movimientos.ruta}?product=${producto.id}`} className="boton boton--auto boton--secundario">
            Ver movimientos
          </Link>
        </>
      }
    >
      <p className="ficha__codigo">
        <span className="tabla__codigo">{producto.code}</span>
      </p>
      <p className="ficha__cifra">
        {formatearPesos(producto.sale_price)}
        {esDueno && producto.cost_price !== undefined && (
          <span className="ficha__cifra-detalle">
            costo {formatearPesos(producto.cost_price)}
            {porcentaje && ` · margen ${porcentaje}`}
          </span>
        )}
      </p>
      <dl className="ficha__datos">
        <div>
          <dt>Existencia</dt>
          <dd className={producto.is_low_stock ? 'ficha__alerta' : undefined}>
            {producto.stock} {producto.min_stock > 0 && `de mínimo ${producto.min_stock}`}
          </dd>
        </div>
        <div>
          <dt>Ubicación</dt>
          <dd>{producto.location || '—'}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{producto.category.name}</dd>
        </div>
        <div>
          <dt>Marca</dt>
          <dd>{producto.brand?.name ?? '—'}</dd>
        </div>
        <div className="ficha__dato--ancho">
          <dt>Motos</dt>
          <dd>{motos || '—'}</dd>
        </div>
      </dl>
      <h4 className="ficha__subtitulo">Últimos movimientos</h4>
      {movimientos.isPending && <p className="texto-suave">Cargando…</p>}
      {movimientos.isError && <p className="texto-suave">No se pudieron cargar los movimientos.</p>}
      {movimientos.isSuccess &&
        (movimientos.data.results.length === 0 ? (
          <p className="texto-suave">Todavía no tiene movimientos.</p>
        ) : (
          <ul className="ficha__lineas">
            {movimientos.data.results.map((m) => (
              <li key={m.id}>
                <span className="ficha__linea-texto">
                  {m.kind_label}
                  <span className="ficha__linea-detalle">{formatearFechaHora(m.created_at)}</span>
                </span>
                <span className={`ficha__linea-monto ${m.quantity > 0 ? 'ficha__entra' : 'ficha__sale'}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Ficha>
  )
}
