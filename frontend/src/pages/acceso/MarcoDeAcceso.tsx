import type { ReactNode } from 'react'
import { useSalud } from '../../hooks/useSalud'

/**
 * Marco de las pantallas de acceso (arranque, asistente e inicio de sesión) en la ventana pequeña: a la izquierda el
 * piñón de la marca centrado, «Bienvenido» y el estado de la conexión; a la derecha el formulario.
 */
export function MarcoDeAcceso({
  titulo,
  descripcion,
  conEstado = true,
  children,
}: {
  titulo: string
  descripcion?: string
  /** Muestra el punto de conexión. Las pantallas de conexión ya lo dicen en su título. */
  conEstado?: boolean
  children: ReactNode
}) {
  return (
    <main className="acceso">
      <div className="acceso__arte">
        <img className="acceso__pinon" src="/logo.png" alt="" aria-hidden="true" width={480} height={469} />
        <p className="acceso__titular">Bienvenido</p>
        {conEstado && <EstadoDeConexion />}
      </div>
      <div className="acceso__formulario">
        <h1>{titulo}</h1>
        {descripcion && <p className="acceso__descripcion">{descripcion}</p>}
        {children}
      </div>
    </main>
  )
}

function EstadoDeConexion() {
  const salud = useSalud()
  const estado = salud.isSuccess ? 'si' : salud.isError ? 'no' : 'espera'
  return (
    <p className={`acceso__estado acceso__estado--${estado}`}>
      {salud.isSuccess ? 'Conectado' : salud.isError ? 'Sin conexión' : 'Conectando…'}
    </p>
  )
}
