import { api } from './client'
import type { Brand, CatalogItemInput, Category, MotoModel } from './types'

// Tipos, marcas y motos (docs/backend/API.md#catálogo-tipos-marcas-y-motos).
// Los listados no están paginados y por defecto solo traen lo activo.

export type TipoDeCatalogo = 'categories' | 'brands' | 'motos'

export interface ElementoDeCatalogo {
  id: number
  name: string
  abbreviation?: string
  is_active: boolean
}

export const listarCatalogo = <T extends ElementoDeCatalogo>(
  tipo: TipoDeCatalogo,
  opciones: { incluirInactivos?: boolean; signal?: AbortSignal } = {},
) =>
  api<T[]>(`/catalog/${tipo}`, {
    query: { include_inactive: opciones.incluirInactivos ? true : undefined },
    signal: opciones.signal,
  })

export const crearElementoDeCatalogo = <T extends ElementoDeCatalogo>(tipo: TipoDeCatalogo, datos: CatalogItemInput) =>
  api<T>(`/catalog/${tipo}`, { method: 'POST', body: datos })

export const editarElementoDeCatalogo = <T extends ElementoDeCatalogo>(
  tipo: TipoDeCatalogo,
  id: number,
  datos: CatalogItemInput,
) => api<T>(`/catalog/${tipo}/${id}`, { method: 'PATCH', body: datos })

export const listarTipos = (signal?: AbortSignal) => listarCatalogo<Category>('categories', { signal })
export const listarMarcas = (signal?: AbortSignal) => listarCatalogo<Brand>('brands', { signal })
export const listarMotos = (signal?: AbortSignal) => listarCatalogo<MotoModel>('motos', { signal })
