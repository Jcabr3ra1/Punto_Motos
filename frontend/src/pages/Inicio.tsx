import { useUsuario } from '../auth/useUsuario'

export function Inicio() {
  const usuario = useUsuario()
  return (
    <section>
      <h1>Hola, {usuario.display_name}</h1>
      <p className="texto-suave">Sesión abierta como {usuario.role_label}.</p>
    </section>
  )
}
