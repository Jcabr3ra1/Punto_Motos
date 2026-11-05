import { useUsuario } from '../auth/useUsuario'
import { Actualizaciones } from '../desktop/Actualizaciones'

export function Inicio() {
  const usuario = useUsuario()
  return (
    <section>
      <h1>Hola, {usuario.display_name}</h1>
      <p className="texto-suave">Sesión abierta como {usuario.role_label}.</p>
      {usuario.role === 'owner' && <Actualizaciones />}
    </section>
  )
}
