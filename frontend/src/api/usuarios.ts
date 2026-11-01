import { api } from './client'
import type { User, UserCreateInput, UserUpdateInput } from './types'

// Administración de usuarios, solo para el dueño (docs/backend/API.md#usuarios-solo-el-dueño).
// La lista no viene paginada: es un arreglo ordenado por `username`.

export const listarUsuarios = (signal?: AbortSignal) => api<User[]>('/users', { signal })

export const crearUsuario = (datos: UserCreateInput) =>
  api<User>('/users', { method: 'POST', body: datos })

export const editarUsuario = (id: number, datos: UserUpdateInput) =>
  api<User>(`/users/${id}`, { method: 'PATCH', body: datos })

/** Cierra la sesión que ese usuario tuviera abierta. */
export const cambiarClave = (id: number, nuevaClave: string) =>
  api<void>(`/users/${id}/set-password`, { method: 'POST', body: { new_password: nuevaClave } })
