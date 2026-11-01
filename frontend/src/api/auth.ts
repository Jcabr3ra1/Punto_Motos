import { api } from './client'
import type { Health, LoginInput, OwnerInput, Session, SetupStatus, User } from './types'

// Endpoints de arranque y sesión (docs/backend/API.md#flujo-de-inicio-del-programa).

export const consultarSalud = (signal?: AbortSignal) => api<Health>('/health', { signal })

export const consultarEstadoInicial = (signal?: AbortSignal) =>
  api<SetupStatus>('/setup/status', { signal })

export const crearPrimerDueno = (datos: OwnerInput) =>
  api<Session>('/setup/owner', { method: 'POST', body: datos })

export const iniciarSesion = (datos: LoginInput) =>
  api<Session>('/auth/login', { method: 'POST', body: datos })

export const cerrarSesion = () => api<void>('/auth/logout', { method: 'POST' })

export const consultarUsuarioActual = () => api<User>('/auth/me')
