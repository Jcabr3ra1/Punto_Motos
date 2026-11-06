// Tipos del contrato de la API. Fuente: docs/backend/API.md (backend 0.11.0).
// Si el contrato cambia, actualizar aquí según docs/backend/CAMBIOS.md.

export interface ApiError {
  /** Código estable para decidir qué hacer. */
  code: string
  /** Texto en español para mostrar al usuario. */
  message: string
  /**
   * Errores por campo; vacío si no aplica. `non_field_errors` va arriba del formulario.
   * Pueden venir anidados (`{ payment: { amount: [...] } }`): usar `desglosarError` para leerlos.
   */
  fields: Record<string, string[] | Record<string, unknown> | unknown[]>
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
  /** De 0 a 100: parte de la mano de obra para los mecánicos sin porcentaje propio. */
  default_mechanic_percentage: number
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

/** Producto nuevo con su cantidad contada: se crea junto con su movimiento de inventario inicial. */
export type InitialCountItemInput = ProductInput & { quantity: number }

export type MovementKind =
  | 'initial_count'
  | 'purchase'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'consignment_out'
  | 'consignment_return'
  | 'workshop_use'

export interface InventoryMovement {
  id: number
  product: { id: number; code: string; name: string }
  kind: MovementKind
  /** «Inventario inicial», «Compra», «Venta», «Devolución» o «Ajuste». */
  kind_label: string
  /** Con signo: 5 entra, -2 sale. */
  quantity: number
  /** Solo el dueño: costo por unidad en ese momento. */
  unit_cost?: number
  /** Existencia que quedó después del movimiento. */
  balance_after: number
  /** Vacío salvo en ajustes. */
  reason: string
  /** Username. */
  created_by: string
  created_at: string
}

export interface AdjustmentInput {
  product: number
  /** Positivo suma, negativo resta; nunca 0. */
  quantity: number
  reason: string
}

// --- Compras y proveedores (solo el dueño) ---

export type PurchaseStatus = 'draft' | 'received'
/** Sin abonos, con abonos, pagada. */
export type PaymentStatus = 'pending' | 'partial' | 'paid'
export type PaymentMethod = 'cash' | 'transfer'

export interface Supplier {
  id: number
  name: string
  /** NIT o cédula; puede ir vacío. */
  tax_id: string
  phone: string
  notes: string
  is_active: boolean
  /** Lo que se le debe en total (compras recibidas). */
  balance_due: number
}

export interface SupplierInput {
  name: string
  tax_id?: string
  phone?: string
  notes?: string
  is_active?: boolean
}

export interface Purchase {
  id: number
  supplier: { id: number; name: string }
  /** Factura o remisión del proveedor; puede ir vacío. */
  document_number: string
  status: PurchaseStatus
  /** «Borrador» o «Recibida». */
  status_label: string
  /** En borrador: suma de las líneas. */
  total: number
  paid_amount: number
  /** total - paid_amount; 0 en borrador. */
  balance_due: number
  /** `null` en borrador. */
  payment_status: PaymentStatus | null
  items_count: number
  created_by: string
  created_at: string
  received_by: string | null
  received_at: string | null
}

export interface PurchaseItem {
  id: number
  product: { id: number; code: string; name: string }
  quantity: number
  /** Costo por unidad que cobró el proveedor. */
  unit_cost: number
  subtotal: number
}

export interface PurchaseDetail extends Purchase {
  notes: string
  items: PurchaseItem[]
  /** Abonos aplicados a esta compra. */
  allocations: {
    payment: number
    paid_on: string
    method: PaymentMethod
    method_label: string
    amount: number
  }[]
}

export interface PurchaseInput {
  supplier: number
  document_number?: string
  notes?: string
  /** Reemplaza todas las líneas anteriores; sin `items`, se conservan. */
  items?: { product: number; quantity: number; unit_cost: number }[]
}

export interface PaymentInput {
  amount: number
  method: PaymentMethod
  /** `AAAA-MM-DD`; por defecto hoy. */
  paid_on?: string
  notes?: string
}

export interface ReceivePurchaseInput {
  /** Abono entregado con la mercancía. */
  payment?: PaymentInput | null
}

export interface PriceChange {
  product: { id: number; code: string; name: string }
  old_price: number
  new_price: number
}

export type ReceivedPurchase = PurchaseDetail & { price_changes: PriceChange[] }

export interface SupplierPayment {
  id: number
  supplier: { id: number; name: string }
  amount: number
  method: PaymentMethod
  method_label: string
  paid_on: string
  notes: string
  allocations: { purchase: number; document_number: string; amount: number }[]
  created_by: string
  created_at: string
}

export type SupplierPaymentInput = PaymentInput & {
  supplier: number
  /** Vacío: paga primero las compras más antiguas. */
  purchase?: number | null
}

// --- Clientes y ventas (cualquier usuario con sesión vende) ---

export interface Customer {
  id: number
  name: string
  /** Puede ir vacío. */
  phone: string
  notes: string
  is_active: boolean
}

export interface CustomerInput {
  name: string
  phone?: string
  notes?: string
  is_active?: boolean
}

export interface Sale {
  id: number
  /** Consecutivo del recibo. */
  number: number
  /** `null`: la venta no tiene cliente. */
  customer: { id: number; name: string; phone: string } | null
  /** Productos + mano de obra. */
  total: number
  items_count: number
  services_count: number
  is_voided: boolean
  /** Username de quien vendió. */
  created_by: string
  created_at: string
}

export interface SaleItem {
  id: number
  product: { id: number; code: string; name: string }
  /** Como quedó en el recibo: «FRE-PUL-PAS · Pastillas de freno Pulsar 180». */
  description: string
  quantity: number
  /** Unidades ya devueltas; se pueden devolver quantity - returned_quantity. */
  returned_quantity: number
  /** Precio del catálogo al vender. */
  list_price: number
  /** Precio cobrado. */
  unit_price: number
  /** El dueño cambió el precio en esta venta. */
  price_changed: boolean
  subtotal: number
  /** Solo el dueño. */
  unit_cost?: number
}

export interface SaleDetail extends Sale {
  notes: string
  items: SaleItem[]
  services: SaleService[]
  payments: { method: PaymentMethod; method_label: string; amount: number }[]
  voided_at: string | null
  voided_by: string | null
  void_reason: string
}

export interface SaleInput {
  /** UUID generado por la ventana para esta venta; se reutiliza en los reintentos. */
  idempotency_key: string
  customer?: number | null
  new_customer?: { name: string; phone?: string } | null
  /** Opcional: la venta necesita al menos un producto o un servicio. */
  items?: { product: number; quantity: number; unit_price?: number }[]
  services?: {
    service_type: number
    mechanic: number
    details?: string
    /** Solo el dueño. */
    labor_price?: number
  }[]
  /** Uno por medio; deben sumar exactamente el total. */
  payments: { method: PaymentMethod; amount: number }[]
  notes?: string
}

// --- Caja (solo el dueño, salvo saber si está abierta) ---

export type CashMovementKind =
  | 'sale'
  | 'sale_refund'
  | 'consignee_payment'
  | 'supplier_payment'
  | 'expense'
  | 'owner_withdrawal'
  | 'mechanic_payment'

export interface CashSummaryRow {
  kind: CashMovementKind
  kind_label: string
  /** Con signo. */
  cash: number
  transfer: number
}

export interface CashSession {
  id: number
  is_open: boolean
  opening_cash: number
  /** Abierta: el de este momento; cerrada: el del cierre. */
  expected_cash: number
  counted_cash: number | null
  /** Contado - esperado: positiva sobra, negativa falta. */
  difference: number | null
  closing_notes: string
  opened_by: string
  opened_at: string
  closed_by: string | null
  closed_at: string | null
  /** No viene en el listado. */
  summary?: { by_kind: CashSummaryRow[]; cash_total: number; transfer_total: number }
}

export interface CurrentCash {
  is_open: boolean
  /** Solo el dueño. */
  session?: CashSession | null
  /** Solo el dueño: efectivo contado en el último cierre. */
  suggested_opening_cash?: number
}

export interface CashMovement {
  id: number
  session: number
  kind: CashMovementKind
  kind_label: string
  method: PaymentMethod
  method_label: string
  /** Con signo. */
  amount: number
  reason: string
  sale: number | null
  sale_number: number | null
  /** Id de la devolución, en sus reembolsos. */
  sale_return: number | null
  supplier_payment: number | null
  consignee_payment: number | null
  /** Id de la liquidación, en los pagos a mecánicos. */
  mechanic_settlement: number | null
  created_by: string
  created_at: string
}

export interface SpendInput {
  kind: 'expense' | 'owner_withdrawal'
  /** Positivo; el movimiento queda negativo. */
  amount: number
  method: PaymentMethod
  reason: string
}

// --- Consignación (solo el dueño) ---

export interface Consignee {
  id: number
  name: string
  tax_id: string
  phone: string
  notes: string
  is_active: boolean
  /** Lo vendido reportado menos lo pagado. */
  balance_due: number
}

export interface ConsigneeInput {
  name: string
  tax_id?: string
  phone?: string
  notes?: string
  is_active?: boolean
}

export interface ConsignmentItem {
  /** Se usa como `item` en el reporte. */
  id: number
  product: { id: number; code: string; name: string }
  quantity: number
  /** Valor pactado por unidad. */
  unit_value: number
  unit_cost: number
  sold_quantity: number
  returned_quantity: number
  /** Las que el local todavía tiene. */
  pending_quantity: number
}

export interface PendingConsignmentItem extends ConsignmentItem {
  delivery: number
  delivered_at: string
}

export interface ConsignmentDelivery {
  id: number
  consignee: { id: number; name: string }
  notes: string
  items: ConsignmentItem[]
  total_value: number
  created_by: string
  created_at: string
}

export interface ConsignmentDeliveryInput {
  idempotency_key: string
  consignee: number
  /** Sin `unit_value`: el costo. */
  items: { product: number; quantity: number; unit_value?: number }[]
  notes?: string
}

export interface ConsignmentReport {
  id: number
  consignee: { id: number; name: string }
  /** Vendidas × valor pactado: lo que sube el saldo. */
  total: number
  notes: string
  lines: {
    item: number
    delivery: number
    product: { id: number; code: string; name: string }
    unit_value: number
    sold: number
    returned: number
    subtotal: number
  }[]
  created_by: string
  created_at: string
}

export interface ConsignmentReportInput {
  consignee: number
  lines: { item: number; sold?: number; returned?: number }[]
  notes?: string
}

export interface ConsigneePayment {
  id: number
  consignee: { id: number; name: string }
  amount: number
  method: PaymentMethod
  method_label: string
  notes: string
  created_by: string
  created_at: string
}

export interface ConsigneePaymentInput {
  consignee: number
  amount: number
  method: PaymentMethod
  notes?: string
}

// --- Taller: tipos de servicio, mecánicos y liquidación ---

export interface ServiceType {
  id: number
  /** Código corto para el buscador de la venta: 101. */
  code: number
  name: string
  /** Mano de obra que se propone en la venta. */
  suggested_price: number
  is_active: boolean
}

export type ServiceTypeInput = Omit<ServiceType, 'id'>

export interface Mechanic {
  id: number
  name: string
  phone: string
  /** Solo el dueño; `null` = usa el porcentaje general. */
  labor_percentage?: number | null
  /** Solo el dueño: el suyo o el general. */
  effective_percentage?: number
  is_active: boolean
}

export interface MechanicInput {
  name: string
  phone?: string
  labor_percentage?: number | null
  is_active?: boolean
}

export interface SaleService {
  id: number
  service_type: { id: number; code: number; name: string }
  mechanic: { id: number; name: string }
  details: string
  suggested_price: number
  /** Mano de obra cobrada. */
  labor_price: number
  price_changed: boolean
  /** Ya se devolvió: un servicio se devuelve una sola vez. */
  is_returned: boolean
}

export interface WorkshopUseInput {
  product: number
  quantity: number
  reason?: string
}

export interface SettlementPreviewRow {
  mechanic: { id: number; name: string }
  services_count: number
  /** Mano de obra sin pagar del día. */
  labor_total: number
  percentage: number
  /** Su parte, antes de descuentos. */
  share: number
  /** Lo que se le descontaría en este pago. */
  deductions_total: number
  /** Lo que se le pagaría: share - deductions_total. */
  amount: number
}

export interface DailySettlement {
  /** AAAA-MM-DD */
  date: string
  mechanics: SettlementPreviewRow[]
  /** Lo que saldría de la caja. */
  total: number
}

export interface SettleInput {
  mechanic: number
  date?: string
  method?: PaymentMethod
}

export interface MechanicSettlement {
  id: number
  mechanic: { id: number; name: string }
  /** Día liquidado. */
  date: string
  labor_total: number
  percentage: number
  /** Lo descontado en ese pago; su parte era amount + deductions_total. */
  deductions_total: number
  amount: number
  method: PaymentMethod
  method_label: string
  services_count: number
  created_by: string
  created_at: string
}

export interface SettledService {
  id: number
  sale_id: number
  sale_number: number
  /** Vacío si la venta no tiene cliente. */
  customer: string
  service_type: { id: number; code: number; name: string }
  details: string
  labor_price: number
}

export interface DeductedService {
  service_type: { id: number; code: number; name: string }
  details: string
  labor_price: number
}

export interface AppliedDeduction {
  /** Lo descontado en esta liquidación. */
  amount: number
  /** El valor completo del descuento. */
  deduction_total: number
  /** Lo que falta por descontar HOY (al reimprimir puede ser menor que entonces). */
  pending_amount: number
  sale_return_number: number
  sale_number: number
  /** Vacío si la venta no tiene cliente. */
  customer: string
  reason: string
  services: DeductedService[]
}

export interface MechanicSettlementDetail extends MechanicSettlement {
  services: SettledService[]
  deductions: AppliedDeduction[]
}

export interface MechanicDeduction {
  id: number
  mechanic: { id: number; name: string }
  /** Valor completo: mano de obra devuelta + repuestos que no vuelven. */
  amount: number
  /** Ya descontado en liquidaciones. */
  applied_amount: number
  /** Falta por descontar. */
  pending_amount: number
  /** Id de la devolución. */
  sale_return: number
  sale_return_number: number
  sale_number: number
  /** Vacío si la venta no tiene cliente. */
  customer: string
  reason: string
  services: DeductedService[]
  created_at: string
}

// --- Devoluciones ---

export type ReturnCause = 'bad_service' | 'other'
export type ReturnCondition = 'resellable' | 'damaged'

export interface SaleReturn {
  id: number
  /** Consecutivo, aparte del de las ventas. */
  number: number
  /** Id de la venta. */
  sale: number
  sale_number: number
  /** `null`: la venta no tiene cliente. */
  customer: { id: number; name: string; phone: string } | null
  cause: ReturnCause
  cause_label: string
  reason: string
  total: number
  created_by: string
  created_at: string
}

export interface SaleReturnDetail extends SaleReturn {
  items: {
    id: number
    sale_item: number
    product: { id: number; code: string; name: string }
    description: string
    quantity: number
    condition: ReturnCondition
    condition_label: string
    /** El cobrado en la venta. */
    unit_price: number
    subtotal: number
  }[]
  services: {
    id: number
    sale_service: number
    service_type: { id: number; code: number; name: string }
    mechanic: { id: number; name: string }
    details: string
    labor_price: number
  }[]
  refunds: { method: PaymentMethod; method_label: string; amount: number }[]
  /** Solo el dueño; `null` si no hay descuento. */
  mechanic_deduction?: {
    mechanic: { id: number; name: string }
    amount: number
    applied_amount: number
    pending_amount: number
  } | null
}

export interface SaleReturnInput {
  idempotency_key: string
  cause: ReturnCause
  reason: string
  items?: { sale_item: number; quantity: number; condition: ReturnCondition }[]
  services?: number[]
  refunds: { method: PaymentMethod; amount: number }[]
}
