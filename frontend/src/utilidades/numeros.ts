const formato = new Intl.NumberFormat('es-CO')

/** Cantidades con separador de miles: `1320` → `1.320`. */
export function formatearNumero(valor: number): string {
  return formato.format(valor)
}

const formatoConSigno = new Intl.NumberFormat('es-CO', { signDisplay: 'always' })

/** Cantidad de un movimiento con su signo: `5` → `+5`, `-2` → `-2`. */
export function formatearConSigno(valor: number): string {
  return formatoConSigno.format(valor)
}
