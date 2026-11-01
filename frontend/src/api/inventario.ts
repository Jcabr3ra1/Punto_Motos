import { api } from './client'
import type { InitialCountItemInput, InitialCountStatus, Product } from './types'

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
