import type { SelectHTMLAttributes } from 'react'
import { CampoPersonalizado } from './CampoPersonalizado'

interface CampoSelectorProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  etiqueta: string
  opciones: readonly { valor: string; texto: string }[]
  errores?: string[]
  ayuda?: string
}

/** Lista desplegable de opciones fijas. */
export function CampoSelector({ etiqueta, opciones, errores, ayuda, ...entrada }: CampoSelectorProps) {
  return (
    <CampoPersonalizado etiqueta={etiqueta} errores={errores} ayuda={ayuda}>
      {(propiedades) => (
        <select {...propiedades} {...entrada}>
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      )}
    </CampoPersonalizado>
  )
}
