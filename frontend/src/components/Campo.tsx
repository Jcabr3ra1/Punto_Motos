import type { InputHTMLAttributes } from 'react'
import { CampoPersonalizado } from './CampoPersonalizado'

interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string
  /** Mensajes de error de este campo (`fields[nombre]` de la API). */
  errores?: string[]
  ayuda?: string
}

/** Campo de una línea. */
export function Campo({ etiqueta, errores, ayuda, ...entrada }: CampoProps) {
  return (
    <CampoPersonalizado etiqueta={etiqueta} errores={errores} ayuda={ayuda}>
      {(propiedades) => <input {...propiedades} {...entrada} />}
    </CampoPersonalizado>
  )
}
