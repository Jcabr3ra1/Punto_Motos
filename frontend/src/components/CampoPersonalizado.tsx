import { useId, type ReactNode } from 'react'

/** Atributos que el control (input, textarea, select…) debe recibir para quedar enlazado a su campo. */
export interface PropiedadesDeControl {
  id: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

interface CampoPersonalizadoProps {
  etiqueta: string
  /** Mensajes de error de este campo (`fields[nombre]` de la API). */
  errores?: string[]
  ayuda?: string
  /** Dibuja el control con los atributos de accesibilidad ya resueltos. */
  children: (propiedades: PropiedadesDeControl) => ReactNode
}

/** Etiqueta, ayuda y errores de un campo, para cualquier tipo de control. */
export function CampoPersonalizado({ etiqueta, errores = [], ayuda, children }: CampoPersonalizadoProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  const idErrores = `${id}-errores`
  const describedBy = [ayuda ? idAyuda : null, errores.length ? idErrores : null].filter(Boolean).join(' ')

  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      {children({
        id,
        'aria-invalid': errores.length > 0 ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
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
