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
      <div className="acceso__contenedor">
        <img className="acceso__logo" src="/logo.png" alt="Punto Moto" width={480} height={470} />
        <p className="acceso__nombre" aria-hidden="true">
          Punto Moto
        </p>
        <div className="acceso__tarjeta">
          <h1>{titulo}</h1>
          {descripcion && <p className="acceso__descripcion">{descripcion}</p>}
          {children}
        </div>
      </div>
    </main>
  )
}
