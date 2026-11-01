import { api } from './client'
import type { Paginated, Product, ProductInput } from './types'

// Productos (docs/backend/API.md#productos). Las existencias llegan en `stock` y no se editan aquí.

export type OrdenDeProductos = 'name' | 'code' | 'sale_price' | 'updated_at' | '-name' | '-code' | '-sale_price' | '-updated_at'

export interface FiltrosDeProductos {
  q?: string
  category?: number
  moto?: number
  workshop_supply?: boolean
  include_inactive?: boolean
  ordering?: OrdenDeProductos
  page?: number
}

export const listarProductos = (filtros: FiltrosDeProductos, signal?: AbortSignal) =>
  api<Paginated<Product>>('/products', {
    query: {
      q: filtros.q?.trim(),
      category: filtros.category,
      moto: filtros.moto,
      workshop_supply: filtros.workshop_supply ? true : undefined,
      include_inactive: filtros.include_inactive ? true : undefined,
      ordering: filtros.ordering,
      page: filtros.page && filtros.page > 1 ? filtros.page : undefined,
    },
    signal,
  })

export const crearProducto = (datos: ProductInput) => api<Product>('/products', { method: 'POST', body: datos })

export const editarProducto = (id: number, datos: Partial<ProductInput>) =>
  api<Product>(`/products/${id}`, { method: 'PATCH', body: datos })

/** Solo el dueño. Responde `{ code: "" }` si faltan datos para armar el código. */
export const sugerirCodigo = (
  datos: { category: number; name: string; moto?: number | null; product?: number },
  signal?: AbortSignal,
) =>
  api<{ code: string }>('/catalog/code-suggestion', {
    query: { category: datos.category, name: datos.name, moto: datos.moto ?? undefined, product: datos.product },
    signal,
  })

/** Buscador de la pantalla de venta: hasta 8 productos activos. Con menos de 2 caracteres responde `[]`. */
export const buscarProductos = (texto: string, signal?: AbortSignal) =>
  api<Product[]>('/catalog/search', { query: { q: texto }, signal })

export const obtenerProducto = (id: number, signal?: AbortSignal) => api<Product>(`/products/${id}`, { signal })
