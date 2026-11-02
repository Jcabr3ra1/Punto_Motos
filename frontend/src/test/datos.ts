import type {
  Brand,
  Category,
  InventoryMovement,
  MotoModel,
  Paginated,
  Product,
  Purchase,
  PurchaseDetail,
  Supplier,
  SupplierPayment,
} from '../api/types'

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

export function proveedor(cambios: Partial<Supplier> = {}): Supplier {
  return {
    id: 1,
    name: 'Distribuidora Andina',
    tax_id: '900555111',
    phone: '3105551234',
    notes: '',
    is_active: true,
    balance_due: 0,
    ...cambios,
  }
}

export function compra(cambios: Partial<Purchase> = {}): Purchase {
  return {
    id: 15,
    supplier: { id: 1, name: 'Distribuidora Andina' },
    document_number: 'FV-1020',
    status: 'received',
    status_label: 'Recibida',
    total: 155000,
    paid_amount: 50000,
    balance_due: 105000,
    payment_status: 'partial',
    items_count: 2,
    created_by: 'dueno',
    created_at: '2026-11-01T09:00:00-05:00',
    received_by: 'dueno',
    received_at: '2026-11-01T10:00:00-05:00',
    ...cambios,
  }
}

export function borrador(cambios: Partial<PurchaseDetail> = {}): PurchaseDetail {
  return {
    ...compra({
      id: 20,
      document_number: 'FV-2001',
      status: 'draft',
      status_label: 'Borrador',
      total: 60000,
      paid_amount: 0,
      balance_due: 0,
      payment_status: null,
      items_count: 1,
      received_by: null,
      received_at: null,
    }),
    notes: '',
    items: [{ id: 1, product: { id: 1, code: 'FRE-PUL-PAS', name: 'Pastillas de freno Pulsar 180' }, quantity: 3, unit_cost: 20000, subtotal: 60000 }],
    allocations: [],
    ...cambios,
  }
}

export function abono(cambios: Partial<SupplierPayment> = {}): SupplierPayment {
  return {
    id: 9,
    supplier: { id: 1, name: 'Distribuidora Andina' },
    amount: 45000,
    method: 'transfer',
    method_label: 'Transferencia',
    paid_on: '2026-11-01',
    notes: 'Nequi',
    allocations: [{ purchase: 15, document_number: 'FV-1020', amount: 45000 }],
    created_by: 'dueno',
    created_at: '2026-11-01T15:20:00-05:00',
    ...cambios,
  }
}

export function paginaDe<T>(resultados: T[], extra: Partial<Paginated<T>> = {}): Paginated<T> {
  return { count: resultados.length, next: null, previous: null, results: resultados, ...extra }
}
