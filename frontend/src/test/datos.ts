import type { Brand, Category, InventoryMovement, MotoModel, Paginated, Product } from '../api/types'

export const frenos: Category = { id: 1, name: 'Frenos', abbreviation: 'FRE', is_active: true }
export const electrico: Category = { id: 2, name: 'Eléctrico', abbreviation: 'ELE', is_active: true }
export const ngk: Brand = { id: 1, name: 'NGK', is_active: true }
export const bosch: Brand = { id: 2, name: 'Bosch', is_active: true }
export const pulsar: MotoModel = { id: 1, name: 'Pulsar 180', abbreviation: 'PUL', is_active: true }
export const boxer: MotoModel = { id: 2, name: 'Boxer CT 100', abbreviation: 'BOX', is_active: true }

export function producto(cambios: Partial<Product> = {}): Product {
  return {
    id: 1,
    code: 'FRE-PUL-PAS',
    name: 'Pastillas de freno Pulsar 180',
    category: frenos,
    brand: bosch,
    moto: pulsar,
    compatible_motos: [boxer],
    is_universal: false,
    cost_price: 18000,
    sale_price: 25000,
    sells_below_cost: false,
    stock: 5,
    min_stock: 3,
    is_low_stock: false,
    location: 'Estante B2',
    is_workshop_supply: false,
    is_active: true,
    updated_at: '2026-11-01T08:00:00-05:00',
    ...cambios,
  }
}

export function pagina(resultados: Product[], extra: Partial<Paginated<Product>> = {}): Paginated<Product> {
  return { count: resultados.length, next: null, previous: null, results: resultados, ...extra }
}

/** Sin costo: así llega el producto a la sesión de un vendedor. */
export function paraVendedor(p: Product): Product {
  const copia = { ...p }
  delete copia.cost_price
  delete copia.sells_below_cost
  return copia
}

export function movimiento(cambios: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    id: 1,
    product: { id: 1, code: 'FRE-PUL-PAS', name: 'Pastillas de freno Pulsar 180' },
    kind: 'adjustment',
    kind_label: 'Ajuste',
    quantity: 5,
    unit_cost: 18000,
    balance_after: 8,
    reason: 'Conteo de bodega',
    created_by: 'dueno',
    created_at: '2026-11-01T09:30:00-05:00',
    ...cambios,
  }
}

/** Sin costo unitario: así llega el movimiento a la sesión de un vendedor. */
export function movimientoParaVendedor(m: InventoryMovement): InventoryMovement {
  const copia = { ...m }
  delete copia.unit_cost
  return copia
}

export function paginaDeMovimientos(
  resultados: InventoryMovement[],
  extra: Partial<Paginated<InventoryMovement>> = {},
): Paginated<InventoryMovement> {
  return { count: resultados.length, next: null, previous: null, results: resultados, ...extra }
}
