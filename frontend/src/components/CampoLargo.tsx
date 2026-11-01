import type { TextareaHTMLAttributes } from 'react'
import { CampoPersonalizado } from './CampoPersonalizado'

interface CampoLargoProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  etiqueta: string
  errores?: string[]
  ayuda?: string
}

/** Campo de varias líneas. */
export function CampoLargo({ etiqueta, errores, ayuda, rows = 3, ...entrada }: CampoLargoProps) {
  return (
    <CampoPersonalizado etiqueta={etiqueta} errores={errores} ayuda={ayuda}>
      {(propiedades) => <textarea rows={rows} {...propiedades} {...entrada} />}
    </CampoPersonalizado>
  )
}
