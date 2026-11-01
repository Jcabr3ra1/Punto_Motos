import { api } from './client'
import type { BusinessSettings, BusinessSettingsInput } from './types'

// Datos del negocio que se imprimen en el recibo (docs/backend/API.md#datos-del-negocio).

export const obtenerNegocio = (signal?: AbortSignal) =>
  api<BusinessSettings>('/settings/business', { signal })

/** Guarda el formulario completo (solo el dueño). */
export const guardarNegocio = (datos: BusinessSettingsInput) =>
  api<BusinessSettings>('/settings/business', { method: 'PUT', body: datos })
