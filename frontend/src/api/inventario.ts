import { api } from './client'
import type { InitialCountStatus } from './types'

// Inventario (docs/backend/API.md#inventario).

/** Lo consultan todos: si `is_open` es `true`, la pantalla de venta debe avisar que el conteo no terminó. */
export const consultarConteoInicial = (signal?: AbortSignal) =>
  api<InitialCountStatus>('/inventory/initial-count', { signal })
