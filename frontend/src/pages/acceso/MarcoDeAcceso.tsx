import type { ReactNode } from 'react'
import { useSalud } from '../../hooks/useSalud'

/**
 * Marco de las pantallas de acceso (arranque, asistente e inicio de sesión) en la ventana pequeña: a la izquierda el
 * arte de la marca y el estado de la conexión; a la derecha el formulario.
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
        <div className="acceso__decoracion" aria-hidden="true">
          <img className="acceso__pinon" src="/logo.png" alt="" width={480} height={469} />
          <span className="acceso__velocidad acceso__velocidad--1" />
          <span className="acceso__velocidad acceso__velocidad--2" />
          <span className="acceso__velocidad acceso__velocidad--3" />
          <span className="acceso__velocidad acceso__velocidad--4" />
        </div>
        <div className="acceso__lema">
          <p className="acceso__titular">
            Tienda y taller,
            <em> en un solo tablero.</em>
          </p>
          <p className="acceso__frase">Ventas, inventario, caja y mecánicos del día, al alcance de la mano.</p>
          {conEstado && <EstadoDeConexion />}
        </div>
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
