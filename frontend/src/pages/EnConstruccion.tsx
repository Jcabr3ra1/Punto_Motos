import type { NivelDeTitulo } from '../components/Titulo'
import { Titulo } from '../components/Titulo'

/** Pantalla que ya tiene su lugar en el menú pero todavía no está construida. */
export function EnConstruccion({ titulo, nivel = 1 }: { titulo: string; nivel?: NivelDeTitulo }) {
  return (
    <section>
      <Titulo nivel={nivel}>{titulo}</Titulo>
      <p className="texto-suave">Esta pantalla está en construcción.</p>
    </section>
  )
}
