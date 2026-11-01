import { Link } from 'react-router'
import { Titulo, type NivelDeTitulo } from '../components/Titulo'

export function SinPermiso({ nivel = 1 }: { nivel?: NivelDeTitulo }) {
  return (
    <section>
      <Titulo nivel={nivel}>No tienes permiso para ver esta pantalla</Titulo>
      <p className="texto-suave">Esta sección es solo para el dueño.</p>
      <Link to="/">Volver al inicio</Link>
    </section>
  )
}
