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

export interface Category {
  id: number
  name: string
  /** Sigla del tipo, primera parte del código: `FRE`. */
  abbreviation: string
  is_active: boolean
}

export interface Brand {
  id: number
  name: string
  is_active: boolean
}

export interface MotoModel {
  id: number
  name: string
  /** Sigla de la moto, segunda parte del código: `PUL`. */
  abbreviation: string
  is_active: boolean
}

export interface Product {
  id: number
  /** Código interno: `FRE-PUL-PAS`. */
  code: string
  name: string
  category: Category
  brand: Brand | null
  /** `null` = repuesto universal. */
  moto: MotoModel | null
  compatible_motos: MotoModel[]
  is_universal: boolean
  /** Solo el dueño. */
  cost_price?: number
  sale_price: number
  /** Solo el dueño: mostrar advertencia. */
  sells_below_cost?: boolean
  /** Unidades disponibles. */
  stock: number
  min_stock: number
  /** `stock <= min_stock`: hay que reponer. */
  is_low_stock: boolean
  location: string
  /** Insumo de taller, incluido en la mano de obra. */
  is_workshop_supply: boolean
  is_active: boolean
  updated_at: string
}

/** Las existencias no se envían aquí: solo cambian con el inventario. */
export interface ProductInput {
  /** Vacío u omitido: se genera automáticamente. */
  code?: string
  name: string
  category: number
  brand?: number | null
  moto?: number | null
  compatible_motos?: number[]
  cost_price: number
  sale_price: number
  min_stock?: number
  location?: string
  is_workshop_supply?: boolean
  is_active?: boolean
}

export interface CatalogItemInput {
  name: string
  abbreviation?: string
  is_active?: boolean
}

export interface InitialCountStatus {
  /** `true` mientras el dueño no haya terminado el conteo: no se debe vender. */
  is_open: boolean
  finished_at: string | null
  /** Username de quien lo terminó. */
  finished_by: string | null
  /** Productos con cantidad cargada. */
  products_counted: number
  /** Suma de las unidades cargadas. */
  units_counted: number
}
