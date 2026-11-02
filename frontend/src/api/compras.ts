import { api } from './client'
import type {
  Paginated,
  PaymentStatus,
  Purchase,
  PurchaseDetail,
  PurchaseInput,
  PurchaseStatus,
  ReceivePurchaseInput,
  ReceivedPurchase,
  Supplier,
  SupplierInput,
  SupplierPayment,
  SupplierPaymentInput,
} from './types'

// Compras y proveedores (docs/backend/API.md#compras-y-proveedores). Todo es solo del dueño.

// --- Proveedores: arreglo sin paginar, ordenado por nombre

export interface FiltrosDeProveedores {
  q?: string
  /** Solo los proveedores a los que se les debe. */
  with_debt?: boolean
  include_inactive?: boolean
}

export const listarProveedores = (filtros: FiltrosDeProveedores = {}, signal?: AbortSignal) =>
  api<Supplier[]>('/suppliers', {
    query: {
      q: filtros.q?.trim(),
      with_debt: filtros.with_debt ? true : undefined,
      include_inactive: filtros.include_inactive ? true : undefined,
    },
    signal,
  })

export const obtenerProveedor = (id: number, signal?: AbortSignal) => api<Supplier>(`/suppliers/${id}`, { signal })

export const crearProveedor = (datos: SupplierInput) => api<Supplier>('/suppliers', { method: 'POST', body: datos })

export const editarProveedor = (id: number, datos: Partial<SupplierInput>) =>
  api<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: datos })

// --- Compras: paginadas, de la más reciente a la más antigua

export interface FiltrosDeCompras {
  supplier?: number
  status?: PurchaseStatus
  /** Uno o varios; solo compras recibidas. */
  payment_status?: PaymentStatus[]
  /** Por día de creación, `AAAA-MM-DD`, ambos incluidos. */
  date_from?: string
  date_to?: string
  page?: number
}

export const listarCompras = (filtros: FiltrosDeCompras = {}, signal?: AbortSignal) =>
  api<Paginated<Purchase>>('/purchases', {
    query: {
      supplier: filtros.supplier,
      status: filtros.status,
      payment_status: filtros.payment_status?.length ? filtros.payment_status.join(',') : undefined,
      date_from: filtros.date_from,
      date_to: filtros.date_to,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
    },
    signal,
  })

export const obtenerCompra = (id: number, signal?: AbortSignal) => api<PurchaseDetail>(`/purchases/${id}`, { signal })

/** Crea el borrador. No toca el inventario. */
export const crearCompra = (datos: PurchaseInput) => api<PurchaseDetail>('/purchases', { method: 'POST', body: datos })

/** Edita el borrador: las líneas enviadas en `items` reemplazan todas las anteriores. */
export const editarCompra = (id: number, datos: Partial<PurchaseInput>) =>
  api<PurchaseDetail>(`/purchases/${id}`, { method: 'PATCH', body: datos })

export const borrarCompra = (id: number) => api<void>(`/purchases/${id}`, { method: 'DELETE' })

/** Recepción completa con un abono opcional. Desde aquí la compra no se edita ni se borra. */
export const recibirCompra = (id: number, datos: ReceivePurchaseInput = {}) =>
  api<ReceivedPurchase>(`/purchases/${id}/receive`, { method: 'POST', body: datos })

// --- Abonos: paginados, del pago más reciente al más antiguo; no se editan ni se borran

export interface FiltrosDeAbonos {
  supplier?: number
  /** Por `paid_on`, ambos incluidos. */
  date_from?: string
  date_to?: string
  page?: number
}

export const listarAbonos = (filtros: FiltrosDeAbonos = {}, signal?: AbortSignal) =>
  api<Paginated<SupplierPayment>>('/supplier-payments', {
    query: {
      supplier: filtros.supplier,
      date_from: filtros.date_from,
      date_to: filtros.date_to,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
    },
    signal,
  })

export const crearAbono = (datos: SupplierPaymentInput) =>
  api<SupplierPayment>('/supplier-payments', { method: 'POST', body: datos })
