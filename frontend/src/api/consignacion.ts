import { api } from './client'
import type {
  Consignee,
  ConsigneeInput,
  ConsigneePayment,
  ConsigneePaymentInput,
  ConsignmentDelivery,
  ConsignmentDeliveryInput,
  ConsignmentReport,
  ConsignmentReportInput,
  Paginated,
  PendingConsignmentItem,
} from './types'

// Consignación (docs/backend/API.md#consignación). Todo es solo del dueño; nada se edita ni se borra
// salvo los datos del local.

export const listarLocales = (
  filtros: { q?: string; with_debt?: boolean; include_inactive?: boolean } = {},
  signal?: AbortSignal,
) =>
  api<Consignee[]>('/consignees', {
    query: {
      q: filtros.q?.trim(),
      with_debt: filtros.with_debt ? true : undefined,
      include_inactive: filtros.include_inactive ? true : undefined,
    },
    signal,
  })

export const crearLocal = (datos: ConsigneeInput) => api<Consignee>('/consignees', { method: 'POST', body: datos })

export const editarLocal = (id: number, datos: Partial<ConsigneeInput>) =>
  api<Consignee>(`/consignees/${id}`, { method: 'PATCH', body: datos })

/** Lo que el local todavía tiene, de la entrega más antigua a la más nueva. */
export const pendientesDeLocal = (id: number, signal?: AbortSignal) =>
  api<PendingConsignmentItem[]>(`/consignees/${id}/pending-items`, { signal })

export interface FiltrosDeConsignacion {
  consignee?: number
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

const consulta = (f: FiltrosDeConsignacion) => ({
  consignee: f.consignee,
  date_from: f.date_from,
  date_to: f.date_to,
  page: f.page && f.page > 1 ? f.page : undefined,
  page_size: f.page_size,
})

export const listarEntregas = (f: FiltrosDeConsignacion = {}, signal?: AbortSignal) =>
  api<Paginated<ConsignmentDelivery>>('/consignment-deliveries', { query: consulta(f), signal })

/** Responde 201, o 200 con la misma entrega si la clave se repite. */
export const registrarEntrega = (datos: ConsignmentDeliveryInput) =>
  api<ConsignmentDelivery>('/consignment-deliveries', { method: 'POST', body: datos })

export const listarReportes = (f: FiltrosDeConsignacion = {}, signal?: AbortSignal) =>
  api<Paginated<ConsignmentReport>>('/consignment-reports', { query: consulta(f), signal })

export const registrarReporte = (datos: ConsignmentReportInput) =>
  api<ConsignmentReport>('/consignment-reports', { method: 'POST', body: datos })

export const listarPagosDeLocales = (f: FiltrosDeConsignacion = {}, signal?: AbortSignal) =>
  api<Paginated<ConsigneePayment>>('/consignee-payments', { query: consulta(f), signal })

export const registrarPagoDeLocal = (datos: ConsigneePaymentInput) =>
  api<ConsigneePayment>('/consignee-payments', { method: 'POST', body: datos })
