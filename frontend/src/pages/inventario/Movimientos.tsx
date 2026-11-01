import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { listarMovimientos, type FiltrosDeMovimientos } from '../../api/inventario'
import { claves } from '../../api/consultas'
import { obtenerProducto } from '../../api/productos'
import type { InventoryMovement, MovementKind, Product } from '../../api/types'
import { useUsuario } from '../../auth/useUsuario'
import { BuscadorDeProductos } from '../../components/BuscadorDeProductos'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { Titulo } from '../../components/Titulo'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearConSigno, formatearNumero } from '../../utilidades/numeros'
import { FormularioDeAjuste } from './FormularioDeAjuste'

const TIPOS: readonly { valor: '' | MovementKind; texto: string }[] = [
  { valor: '', texto: 'Todos los tipos' },
  { valor: 'initial_count', texto: 'Inventario inicial' },
  { valor: 'purchase', texto: 'Compra' },
  { valor: 'sale', texto: 'Venta' },
  { valor: 'return', texto: 'Devolución' },
  { valor: 'adjustment', texto: 'Ajuste' },
]

/** Los filtros viven en la dirección (`?product=7&kind=adjustment`): sirven los enlaces y el botón «atrás». */
function leerFiltros(params: URLSearchParams): FiltrosDeMovimientos {
  const producto = Number(params.get('product'))
  const pagina = Number(params.get('page'))
  return {
    product: Number.isInteger(producto) && producto > 0 ? producto : undefined,
    kind: (params.get('kind') || undefined) as MovementKind | undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
  }
}

// Kárdex: todos consultan; solo el dueño ajusta existencias. Los movimientos no se editan ni se borran.
export function Movimientos() {
  const esDueno = useUsuario().role === 'owner'
  const [params, setParams] = useSearchParams()
  const [ajustando, setAjustando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const filtros = leerFiltros(params)

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

  const movimientos = useQuery({
    queryKey: [...claves.movimientos, filtros],
    queryFn: ({ signal }) => listarMovimientos(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const producto = useQuery({
    queryKey: claves.producto(filtros.product ?? 0),
    queryFn: ({ signal }) => obtenerProducto(filtros.product!, signal),
    enabled: filtros.product !== undefined,
  })

  if (ajustando) {
    return (
      <section>
        <Titulo>Ajustar existencia</Titulo>
        <FormularioDeAjuste
          productoInicial={producto.data}
          onTerminar={(mensaje) => {
            setAviso(mensaje)
            setAjustando(false)
          }}
          onCancelar={() => setAjustando(false)}
        />
      </section>
    )
  }

  const hayFiltros = Boolean(filtros.product || filtros.kind || filtros.date_from || filtros.date_to)

  return (
    <section>
      <div className="barra-de-acciones">
        <Titulo>Movimientos de inventario</Titulo>
        {esDueno && (
          <button
            type="button"
            className="boton boton--auto"
            onClick={() => {
              setAviso(null)
              setAjustando(true)
            }}
          >
            Ajustar existencia
          </button>
        )}
      </div>
      <p className="texto-suave">
        Cada entrada o salida de unidades queda registrada, del más reciente al más antiguo. Los movimientos no se
        editan: un error se corrige con otro movimiento.
      </p>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}

      <div className="filtros" role="search" aria-label="Filtrar movimientos">
        <div>
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
        <CampoSelector
          etiqueta="Tipo"
          value={filtros.kind ?? ''}
          onChange={(e) => cambiar({ kind: e.target.value || undefined })}
          opciones={TIPOS}
        />
        <Campo
          etiqueta="Desde"
          type="date"
          value={filtros.date_from ?? ''}
          onChange={(e) => cambiar({ date_from: e.target.value || undefined })}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={filtros.date_to ?? ''}
          onChange={(e) => cambiar({ date_to: e.target.value || undefined })}
        />
      </div>

      {movimientos.isPending && <Cargando />}
      {movimientos.isError && <ErrorDeCarga error={movimientos.error} onReintentar={() => void movimientos.refetch()} />}

      {movimientos.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {movimientos.data.count === 1 ? '1 movimiento' : `${formatearNumero(movimientos.data.count)} movimientos`}
          </p>
          {movimientos.data.count === 0 ? (
            <p className="texto-suave">
              {hayFiltros ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos.'}
            </p>
          ) : (
            <>
              <TablaDeMovimientos movimientos={movimientos.data.results} esDueno={esDueno} />
              <Paginacion
                etiqueta="Páginas de movimientos"
                pagina={filtros.page ?? 1}
                total={movimientos.data.count}
                hayAnterior={Boolean(movimientos.data.previous)}
                haySiguiente={Boolean(movimientos.data.next)}
                onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              />
            </>
          )}
        </>
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
            <th scope="col">Hecho por</th>
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
              <td>{movimiento.reason || '—'}</td>
              <td>{movimiento.created_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
