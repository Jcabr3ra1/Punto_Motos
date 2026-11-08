import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Cuando una lista no tiene nada: el icono de la sección en grande, una frase y la acción para empezar. */
export function EstadoVacio({ icono: Icono, mensaje, accion }: { icono: LucideIcon; mensaje: string; accion?: ReactNode }) {
  return (
    <div className="estado-vacio">
      <Icono className="estado-vacio__icono" aria-hidden="true" size={32} strokeWidth={1.5} />
      <p className="estado-vacio__mensaje">{mensaje}</p>
      {accion}
    </div>
  )
}
