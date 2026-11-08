import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { listarMovimientos } from '../../api/inventario'
import type { Product } from '../../api/types'
import { Registro } from '../../components/Registro'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'

const formatoDePorcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 0 })

/** Ganancia sobre el precio de venta: (precio − costo) / precio. */
function margen(producto: Product): string | null {
  if (producto.cost_price === undefined || producto.sale_price <= 0) return null
  return formatoDePorcentaje.format((producto.sale_price - producto.cost_price) / producto.sale_price)
}

/** Ficha de un producto en el registro negro: precio, existencia, ubicación, motos y sus últimos movimientos. */
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
    <Registro
      titulo={producto.name}
      modulo="Productos"
      onCerrar={onCerrar}
      acciones={
        <>
          {esDueno && (
            <button type="button" className="boton" onClick={() => onEditar(producto)}>
              Editar
            </button>
          )}
          <Link to={`${DESTINOS.movimientos.ruta}?product=${producto.id}`} className="boton boton--secundario">
            Ver movimientos
          </Link>
        </>
      }
    >
      <p className="registro__cifra">
        <span className="tabla__codigo">{producto.code}</span>
        <span className="registro__total">{formatearPesos(producto.sale_price)}</span>
        {esDueno && producto.cost_price !== undefined && (
          <span className="registro__detalle">
            costo {formatearPesos(producto.cost_price)}
            {porcentaje && ` · margen ${porcentaje}`}
          </span>
        )}
      </p>
      <dl className="registro__datos">
        <div>
          <dt>Existencia</dt>
          <dd className={producto.is_low_stock ? 'registro__alerta' : undefined}>
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
        <div>
          <dt>Motos</dt>
          <dd>{motos || '—'}</dd>
        </div>
      </dl>
      <h4 className="registro__subtitulo">Últimos movimientos</h4>
      {movimientos.isPending && <p className="registro__nota">Cargando…</p>}
      {movimientos.isError && <p className="registro__nota">No se pudieron cargar los movimientos.</p>}
      {movimientos.isSuccess &&
        (movimientos.data.results.length === 0 ? (
          <p className="registro__nota">Todavía no tiene movimientos.</p>
        ) : (
          <ul className="registro__lineas">
            {movimientos.data.results.map((m) => (
              <li key={m.id}>
                <span>
                  {m.kind_label}
                  <span className="registro__detalle">{formatearFechaHora(m.created_at)}</span>
                </span>
                <span className={`registro__monto ${m.quantity > 0 ? 'registro__entra' : 'registro__sale'}`}>
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Registro>
  )
}
