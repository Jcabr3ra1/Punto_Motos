import { Link } from 'react-router'

export function NoEncontrada() {
  return (
    <section>
      <h1>No encontramos esa pantalla</h1>
      <p className="texto-suave">Revisa el menú para ir a una sección.</p>
      <Link to="/">Volver al inicio</Link>
    </section>
  )
}
