import type { CashSession } from '../../api/types'
import { formatearPesos } from '../../utilidades/dinero'

/** Cómo terminó una caja: «Cuadró», «Faltaron $ 1.000», «Sobraron $ 500» o «Abierta». */
export function cuadreDeCaja(caja: Pick<CashSession, 'is_open' | 'difference'>): string {
  if (caja.is_open) return 'Abierta'
  if (caja.difference === null) return 'Sin contar'
  if (caja.difference === 0) return 'Cuadró'
  return caja.difference > 0 ? `Sobraron ${formatearPesos(caja.difference)}` : `Faltaron ${formatearPesos(-caja.difference)}`
}
