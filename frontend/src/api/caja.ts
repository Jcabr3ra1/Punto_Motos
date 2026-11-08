import { api } from './client'
import type { CashMovement, CashMovementKind, CashSession, CurrentCash, Paginated, PaymentMethod, SpendInput } from './types'

// Caja (docs/backend/API.md#caja). Todo es del dueño salvo saber si está abierta.

/** El vendedor solo recibe `is_open`; el dueño también la sesión y el efectivo sugerido. */
export const consultarCajaActual = (signal?: AbortSignal) => api<CurrentCash>('/cash-sessions/current', { signal })

export const abrirCaja = (efectivoInicial: number) =>
  api<CashSession>('/cash-sessions', { method: 'POST', body: { opening_cash: efectivoInicial } })

export const cerrarCaja = (id: number, datos: { counted_cash?: number; notes: string }) =>
  api<CashSession>(`/cash-sessions/${id}/close`, { method: 'POST', body: datos })

export const listarCajas = (filtros: { date_from?: string; date_to?: string; page?: number } = {}, signal?: AbortSignal) =>
  api<Paginated<CashSession>>('/cash-sessions', {
    query: { date_from: filtros.date_from, date_to: filtros.date_to, page: filtros.page && filtros.page > 1 ? filtros.page : undefined },
    signal,
  })

export const obtenerCaja = (id: number, signal?: AbortSignal) => api<CashSession>(`/cash-sessions/${id}`, { signal })

export const listarMovimientosDeCaja = (
  filtros: { session?: number; kind?: CashMovementKind; method?: PaymentMethod; page?: number; page_size?: number } = {},
  signal?: AbortSignal,
) =>
  api<Paginated<CashMovement>>('/cash-movements', {
    query: { session: filtros.session, kind: filtros.kind, method: filtros.method, page: filtros.page && filtros.page > 1 ? filtros.page : undefined, page_size: filtros.page_size },
    signal,
  })

/** Gasto o retiro del dueño, siempre con motivo. */
export const registrarSalida = (datos: SpendInput) => api<CashMovement>('/cash-movements', { method: 'POST', body: datos })
