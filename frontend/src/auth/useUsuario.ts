import type { User } from '../api/types'
import { useAuth } from './useAuth'

/** El usuario con la sesión abierta. Solo se usa en pantallas que existen con sesión. */
export function useUsuario(): User {
  const { estado } = useAuth()
  if (estado.fase !== 'con-sesion') throw new Error('useUsuario requiere una sesión abierta.')
  return estado.usuario
}
