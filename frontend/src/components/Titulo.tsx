import type { ReactNode } from 'react'

export type NivelDeTitulo = 1 | 2 | 3

/** Título de pantalla: `h1` en las principales y `h2` o `h3` cuando están dentro de otra. */
export function Titulo({ nivel = 1, children }: { nivel?: NivelDeTitulo; children: ReactNode }) {
  const Etiqueta = `h${nivel}` as 'h1' | 'h2' | 'h3'
  return <Etiqueta>{children}</Etiqueta>
}
