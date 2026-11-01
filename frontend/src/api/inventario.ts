import { api } from './client'
import type {
  AdjustmentInput,
  InitialCountItemInput,
  InitialCountStatus,
  InventoryMovement,
  MovementKind,
  Paginated,
  Product,
} from './types'

// Inventario (docs/backend/API.md#inventario).

/** Lo consultan todos: si `is_open` es `true`, la pantalla de venta debe avisar que el conteo no terminó. */
export const consultarConteoInicial = (signal?: AbortSignal) =>
  api<InitialCountStatus>('/inventory/initial-count', { signal })

/** Solo el dueño. Crea el producto y su movimiento de inventario inicial juntos; responde el `Product` con su `stock`. */
export const cargarProductoInicial = (datos: InitialCountItemInput) =>
  api<Product>('/inventory/initial-count/items', { method: 'POST', body: datos })

/** Solo el dueño. No se puede deshacer: pedir confirmación antes de llamarlo. */
export const terminarConteoInicial = () =>
  api<InitialCountStatus>('/inventory/initial-count/finish', { method: 'POST' })

export interface FiltrosDeMovimientos {
  /** Id del producto: kárdex de un producto. */
  product?: number
  kind?: MovementKind
  /** `AAAA-MM-DD`, incluida, en hora de Colombia. */
  date_from?: string
  date_to?: string
  page?: number
}

/** Kárdex paginado, del más reciente al más antiguo. El vendedor no recibe `unit_cost`. */
export const listarMovimientos = (filtros: FiltrosDeMovimientos, signal?: AbortSignal) =>
  api<Paginated<InventoryMovement>>('/inventory/movements', {
    query: {
      product: filtros.product,
      kind: filtros.kind,
      date_from: filtros.date_from,
      date_to: filtros.date_to,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
    },
    signal,
  })

/** Solo el dueño. Responde el movimiento creado, con la existencia que quedó. */
export const crearAjuste = (datos: AdjustmentInput) =>
  api<InventoryMovement>('/inventory/adjustments', { method: 'POST', body: datos })
