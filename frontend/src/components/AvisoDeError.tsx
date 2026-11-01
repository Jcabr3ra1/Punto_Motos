/** Errores generales de un formulario (los que no pertenecen a un campo). */
export function AvisoDeError({ mensajes }: { mensajes: string[] }) {
  if (mensajes.length === 0) return null
  return (
    <div role="alert" className="aviso aviso--error">
      {mensajes.map((mensaje) => (
        <p key={mensaje}>{mensaje}</p>
      ))}
    </div>
  )
}
