import type { PaymentMethod } from '../../api/types'
import { MEDIOS_DE_PAGO } from './etiquetas'

/** Efectivo o transferencia, como botones de opción. */
export function MedioDePago({
  valor,
  onCambiar,
  nombre,
  errores = [],
}: {
  valor: PaymentMethod
  onCambiar: (medio: PaymentMethod) => void
  /** Nombre del grupo de opciones; único si hay varios en pantalla. */
  nombre: string
  errores?: string[]
}) {
  return (
    <fieldset className="conjunto">
      <legend>Medio de pago</legend>
      <div className="opciones-en-fila">
        {MEDIOS_DE_PAGO.map((medio) => (
          <label key={medio.valor} className="opcion">
            <input type="radio" name={nombre} checked={valor === medio.valor} onChange={() => onCambiar(medio.valor)} />
            {medio.texto}
          </label>
        ))}
      </div>
      {errores.length > 0 && (
        <ul className="campo__errores">
          {errores.map((mensaje) => (
            <li key={mensaje}>{mensaje}</li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
