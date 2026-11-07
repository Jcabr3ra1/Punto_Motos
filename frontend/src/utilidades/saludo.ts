/** «Buenos días» hasta las 11:59, «Buenas tardes» hasta las 18:59 y «Buenas noches» el resto. */
export function saludoSegunHora(fecha: Date): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
  const hora = fecha.getHours()
  if (hora >= 5 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}
