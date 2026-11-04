import { api } from './client'
import type {
  DailySettlement,
  InventoryMovement,
  Mechanic,
  MechanicInput,
  MechanicSettlement,
  MechanicSettlementDetail,
  Paginated,
  ServiceType,
  ServiceTypeInput,
  SettleInput,
  WorkshopUseInput,
} from './types'

// Taller (docs/backend/API.md#taller-tipos-de-servicio-y-mecánicos) y liquidación de mecánicos.

const inactivos = (incluir?: boolean) => ({ include_inactive: incluir ? true : undefined })

/** Ordenados por código, sin paginar. Todos los consultan. */
export const listarTiposDeServicio = (incluirInactivos = false, signal?: AbortSignal) =>
  api<ServiceType[]>('/service-types', { query: inactivos(incluirInactivos), signal })

export const crearTipoDeServicio = (datos: Partial<ServiceTypeInput>) =>
  api<ServiceType>('/service-types', { method: 'POST', body: datos })

export const editarTipoDeServicio = (id: number, datos: Partial<ServiceTypeInput>) =>
  api<ServiceType>(`/service-types/${id}`, { method: 'PATCH', body: datos })

/** El vendedor no recibe los porcentajes. */
export const listarMecanicos = (incluirInactivos = false, signal?: AbortSignal) =>
  api<Mechanic[]>('/mechanics', { query: inactivos(incluirInactivos), signal })

export const crearMecanico = (datos: MechanicInput) => api<Mechanic>('/mechanics', { method: 'POST', body: datos })

export const editarMecanico = (id: number, datos: Partial<MechanicInput>) =>
  api<Mechanic>(`/mechanics/${id}`, { method: 'PATCH', body: datos })

/** Solo el dueño: saca un insumo de taller sin cobrarlo. */
export const registrarConsumoDelTaller = (datos: WorkshopUseInput) =>
  api<InventoryMovement>('/inventory/workshop-use', { method: 'POST', body: datos })

/** Solo el dueño: lo que se le debe a cada mecánico ese día (hoy por defecto). */
export const consultarLiquidacionDelDia = (fecha?: string, signal?: AbortSignal) =>
  api<DailySettlement>('/mechanic-settlements/daily', { query: { date: fecha }, signal })

/** Le paga su parte del día; sale de la caja abierta de hoy. */
export const pagarAMecanico = (datos: SettleInput) =>
  api<MechanicSettlementDetail>('/mechanic-settlements/daily', { method: 'POST', body: datos })

export const listarLiquidaciones = (
  filtros: { mechanic?: number; date_from?: string; date_to?: string; page?: number } = {},
  signal?: AbortSignal,
) =>
  api<Paginated<MechanicSettlement>>('/mechanic-settlements', {
    query: {
      mechanic: filtros.mechanic,
      date_from: filtros.date_from,
      date_to: filtros.date_to,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
    },
    signal,
  })

export const obtenerLiquidacion = (id: number, signal?: AbortSignal) =>
  api<MechanicSettlementDetail>(`/mechanic-settlements/${id}`, { signal })
