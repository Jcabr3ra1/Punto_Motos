import type { ReactNode } from 'react'

/** Tarjeta centrada que comparten las pantallas de arranque, asistente e inicio de sesión. */
export function MarcoDeAcceso({
  titulo,
  descripcion,
  children,
}: {
  titulo: string
  descripcion?: string
  children: ReactNode
}) {
  return (
    <main className="acceso">
      <div className="acceso__tarjeta">
        <p className="acceso__marca">Punto Moto</p>
        <h1>{titulo}</h1>
        {descripcion && <p className="acceso__descripcion">{descripcion}</p>}
        {children}
      </div>
    </main>
  )
}
