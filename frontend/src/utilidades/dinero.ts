const formato = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

/** Pesos colombianos enteros tal como llegan de la API: `25000` → `$ 25.000`. No se multiplica ni se divide. */
export function formatearPesos(valor: number): string {
  return formato.format(valor)
}
