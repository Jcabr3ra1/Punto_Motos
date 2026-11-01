// Tipos del contrato de la API. Fuente: docs/backend/API.md (backend 0.3.0).
// Si el contrato cambia, actualizar aquí según docs/backend/CAMBIOS.md.

export interface ApiError {
  /** Código estable para decidir qué hacer. */
  code: string
  /** Texto en español para mostrar al usuario. */
  message: string
  /** Errores por campo; vacío si no aplica. `non_field_errors` va arriba del formulario. */
  fields: Record<string, string[]>
}

export type Role = 'owner' | 'seller'

export interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  display_name: string
  role: Role
  role_label: string
  is_active: boolean
  last_login: string | null
}

export interface Session {
  token: string
  user: User
}

export interface SetupStatus {
  needs_owner: boolean
}

export interface LoginInput {
  username: string
  password: string
}

/** Primer dueño: mismas reglas de campos que POST /users, sin `role`. */
export interface OwnerInput {
  username: string
  first_name?: string
  last_name?: string
  password: string
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Health {
  status: 'ok'
  version: string
  server_time: string
}

export interface BusinessSettings {
  name: string
  tax_id: string
  address: string
  phone: string
  receipt_footer: string
  updated_at: string
}

export type BusinessSettingsInput = Omit<BusinessSettings, 'updated_at'>

export interface UserCreateInput {
  username: string
  first_name?: string
  last_name?: string
  role: Role
  password: string
}

/** `username` y la contraseña no se cambian por aquí (ver POST /users/{id}/set-password). */
export interface UserUpdateInput {
  first_name?: string
  last_name?: string
  role?: Role
  is_active?: boolean
}
