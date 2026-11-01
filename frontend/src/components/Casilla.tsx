import { useId, type InputHTMLAttributes } from 'react'

interface CasillaProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  etiqueta: string
  ayuda?: string
}

/** Casilla de verificación con su etiqueta y una ayuda opcional. */
export function Casilla({ etiqueta, ayuda, ...entrada }: CasillaProps) {
  const id = useId()
  const idAyuda = `${id}-ayuda`
  return (
    <div className="campo campo--casilla">
      <input id={id} type="checkbox" aria-describedby={ayuda ? idAyuda : undefined} {...entrada} />
      <div>
        <label htmlFor={id}>{etiqueta}</label>
        {ayuda && (
          <p id={idAyuda} className="campo__ayuda">
            {ayuda}
          </p>
        )}
      </div>
    </div>
  )
}
