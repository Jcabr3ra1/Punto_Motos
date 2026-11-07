import { ArrowRight } from 'lucide-react'

// Cómo queda una cifra si se guarda el formulario: existencias, efectivo de la caja. Se ve antes de confirmar.
export function VistaPrevia({
  etiqueta,
  antes,
  despues,
  nota,
  alerta = false,
}: {
  etiqueta: string
  antes: string
  despues: string
  nota?: string
  /** El resultado no es posible o requiere atención: se muestra en color de alerta, no en lima. */
  alerta?: boolean
}) {
  return (
    <div className="vista-previa">
      <p className="vista-previa__linea">
        <span className="vista-previa__etiqueta">{etiqueta}</span>{' '}
        <span className="vista-previa__cambio">
          <span className="solo-lectores">de </span>
          <span className="vista-previa__antes">{antes}</span>{' '}
          <ArrowRight aria-hidden="true" size={14} />
          <span className="solo-lectores">a </span>
          <strong className={`vista-previa__despues${alerta ? ' vista-previa__despues--alerta' : ''}`}>{despues}</strong>
        </span>
      </p>
      {nota && <p className="vista-previa__nota">{nota}</p>}
    </div>
  )
}
