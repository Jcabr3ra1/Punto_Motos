import { useId, type InputHTMLAttributes } from 'react'

interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string
  /** Mensajes de error de este campo (`fields[nombre]` de la API). */
  errores?: string[]
  ayuda?: string
}

export function Campo({ etiqueta, errores = [], ayuda, ...entrada }: CampoProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idErrores = `${id}-errores`
  const describedBy = [ayuda ? idAyuda : null, errores.length ? idErrores : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        aria-invalid={errores.length > 0 || undefined}
        aria-describedby={describedBy || undefined}
        {...entrada}
      />
      {ayuda && (
        <p id={idAyuda} className="campo__ayuda">
          {ayuda}
        </p>
      )}
      {errores.length > 0 && (
        <ul id={idErrores} className="campo__errores">
          {errores.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
