import { api } from './client'
import type {
  Customer,
  CustomerInput,
  Paginated,
  ReturnCause,
  Sale,
  SaleDetail,
  SaleInput,
  SaleReturn,
  SaleReturnDetail,
  SaleReturnInput,
} from './types'

// Clientes y ventas (docs/backend/API.md#clientes-y-ventas). Cualquier usuario con sesión vende.

export const buscarClientes = (texto: string, signal?: AbortSignal) =>
  api<Paginated<Customer>>('/customers', { query: { q: texto.trim(), page_size: 8 }, signal })

export const crearCliente = (datos: CustomerInput) => api<Customer>('/customers', { method: 'POST', body: datos })

/**
 * Confirma una venta pagada completa. Responde la venta nueva (201) o, si la `idempotency_key`
 * se repite (doble clic, reintento), la misma venta ya hecha (200) sin descontar otra vez.
 */
export const registrarVenta = (datos: SaleInput) => api<SaleDetail>('/sales', { method: 'POST', body: datos })

export interface FiltrosDeVentas {
  number?: number
  customer?: number
  /** Ventas con algún servicio de ese mecánico. */
  mechanic?: number
  voided?: boolean
  date_from?: string
  date_to?: string
  page?: number
  /** 50 por defecto, máximo 200. */
  page_size?: number
}

export const listarVentas = (filtros: FiltrosDeVentas = {}, signal?: AbortSignal) =>
  api<Paginated<Sale>>('/sales', {
    query: {
      number: filtros.number,
      customer: filtros.customer,
      mechanic: filtros.mechanic,
      voided: filtros.voided,
      date_from: filtros.date_from,
      date_to: filtros.date_to,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
      page_size: filtros.page_size,
    },
    signal,
  })

export const obtenerVenta = (id: number, signal?: AbortSignal) => api<SaleDetail>(`/sales/${id}`, { signal })

/** Solo el dueño y con caja abierta. Devuelve las unidades y reembolsa los pagos. */
export const anularVenta = (id: number, motivo: string) =>
  api<SaleDetail>(`/sales/${id}/void`, { method: 'POST', body: { reason: motivo } })

/** UUID nuevo para una venta o entrega nueva. Se reutiliza en los reintentos de la misma. */
export const nuevaClaveDeReintento = () => crypto.randomUUID()

/**
 * Registra una devolución parcial o total (201, o 200 si se repite la `idempotency_key`).
 * Cualquier usuario con sesión la registra, salvo la causa `bad_service` (solo el dueño).
 */
export const registrarDevolucion = (ventaId: number, datos: SaleReturnInput) =>
  api<SaleReturnDetail>(`/sales/${ventaId}/returns`, { method: 'POST', body: datos })

export interface FiltrosDeDevoluciones {
  sale?: number
  number?: number
  cause?: ReturnCause
  date_from?: string
  date_to?: string
  page?: number
}

export const listarDevoluciones = (filtros: FiltrosDeDevoluciones = {}, signal?: AbortSignal) =>
  api<Paginated<SaleReturn>>('/sale-returns', {
    query: {
      sale: filtros.sale,
      number: filtros.number,
      cause: filtros.cause,
      date_from: filtros.date_from,
      date_to: filtros.date_to,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
    },
    signal,
  })

export const obtenerDevolucion = (id: number, signal?: AbortSignal) => api<SaleReturnDetail>(`/sale-returns/${id}`, { signal })
