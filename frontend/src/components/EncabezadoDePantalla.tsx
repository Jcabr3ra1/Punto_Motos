import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  icono: LucideIcon
  titulo: string
  /** Para qué sirve la pantalla, en una línea. */
  descripcion: string
  /** Botones de la pantalla; la acción principal va en lima y al final. */
  acciones?: ReactNode
  /** 1 solo en pantallas fuera de una sección, como Inicio; en las demás el h1 lo pone la sección. */
  nivel?: 1 | 2
}

/** Encabezado común de las pantallas: placa negra con el icono de la sección, título, para qué sirve y acciones. */
export function EncabezadoDePantalla({ icono: Icono, titulo, descripcion, acciones, nivel = 2 }: Props) {
  const Titulo = nivel === 1 ? 'h1' : 'h2'
  return (
    <div className="encabezado-pantalla">
      <span className="encabezado-pantalla__placa" aria-hidden="true">
        <Icono size={20} strokeWidth={1.75} />
      </span>
      <div className="encabezado-pantalla__texto">
        <Titulo className="encabezado-pantalla__titulo">{titulo}</Titulo>
        <p className="encabezado-pantalla__descripcion">{descripcion}</p>
      </div>
      {acciones && <div className="encabezado-pantalla__acciones">{acciones}</div>}
    </div>
  )
}
