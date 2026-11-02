import type { PaymentMethod, PaymentStatus } from '../../api/types'

/** Estado de pago de una compra recibida, en palabras del negocio. */
export const ESTADO_DE_PAGO: Record<PaymentStatus, string> = {
  pending: 'Sin abonos',
  partial: 'Con abonos',
  paid: 'Pagada',
}

export const MEDIOS_DE_PAGO: readonly { valor: PaymentMethod; texto: string }[] = [
  { valor: 'cash', texto: 'Efectivo' },
  { valor: 'transfer', texto: 'Transferencia' },
]
