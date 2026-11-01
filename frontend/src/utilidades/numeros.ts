const formato = new Intl.NumberFormat('es-CO')

/** Cantidades con separador de miles: `1320` → `1.320`. */
export function formatearNumero(valor: number): string {
  return formato.format(valor)
}
