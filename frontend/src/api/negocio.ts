import { api, downloadBlob } from './client'
import type { BusinessNotifications, BusinessSettings, BusinessSettingsInput, MonthlyReport } from './types'

// Datos del negocio que se imprimen en el recibo (docs/backend/API.md#datos-del-negocio).

export const obtenerNegocio = (signal?: AbortSignal) =>
  api<BusinessSettings>('/settings/business', { signal })

/** Guarda el formulario completo (solo el dueño). */
export const guardarNegocio = (datos: BusinessSettingsInput) =>
  api<BusinessSettings>('/settings/business', { method: 'PUT', body: datos })

/** Descarga una copia verificada de la base de datos SQLite (solo el dueño). */
export async function descargarCopiaDeSeguridad(): Promise<{ filename: string; sha256?: string }> {
  const { blob, filename, sha256 } = await downloadBlob('/backups/download')
  const nombre = filename ?? `punto-moto-respaldo-${new Date().toISOString().slice(0, 10)}.sqlite3`
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
  return { filename: nombre, sha256 }
}

/** Recuento mensual consolidado del negocio para `AAAA-MM` (solo el dueño). */
export const consultarReporteMensual = (month?: string, signal?: AbortSignal) =>
  api<MonthlyReport>('/reports/monthly', { query: { month }, signal })

/** Alertas operativas y productos por acabarse para la barra superior. */
export const consultarNotificaciones = (signal?: AbortSignal) =>
  api<BusinessNotifications>('/notifications', { signal })
