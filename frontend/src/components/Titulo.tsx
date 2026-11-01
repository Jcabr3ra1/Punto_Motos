import type { ReactNode } from 'react'

export type NivelDeTitulo = 1 | 2

/** Título de pantalla: `h1` en las pantallas principales y `h2` dentro de otra (por ejemplo, Configuración). */
export function Titulo({ nivel = 1, children }: { nivel?: NivelDeTitulo; children: ReactNode }) {
  return nivel === 1 ? <h1>{children}</h1> : <h2>{children}</h2>
}
