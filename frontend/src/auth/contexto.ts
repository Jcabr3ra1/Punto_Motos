import { createContext } from 'react'
import type { LoginInput, OwnerInput, User } from '../api/types'

export type EstadoAcceso =
  | { fase: 'conectando' }
  | { fase: 'sin-conexion'; mensaje: string }
  | { fase: 'primer-uso' }
  | { fase: 'sin-sesion' }
  | { fase: 'con-sesion'; usuario: User }

export interface ContextoAuth {
  estado: EstadoAcceso
  /** `true` si la sesión terminó sola (otro inicio de sesión, usuario desactivado, etc.). */
  sesionVencida: boolean
  reintentar: () => void
  /** Si falla, lanza el `ApiError` para que el formulario lo muestre. */
  iniciarSesion: (datos: LoginInput) => Promise<void>
  crearPrimerDueno: (datos: OwnerInput) => Promise<void>
  cerrarSesion: () => Promise<void>
}

export const ContextoAuth = createContext<ContextoAuth | null>(null)
