import { useState } from 'react'
import type { User } from '../api/types'
import { useAuth } from '../auth/useAuth'

// Pantalla provisional con la sesión abierta. Se reemplaza en el paso 3 por el menú y las pantallas.
export function InicioProvisional({ usuario }: { usuario: User }) {
  const { cerrarSesion } = useAuth()
  const [saliendo, setSaliendo] = useState(false)

  async function alSalir() {
    setSaliendo(true)
    await cerrarSesion()
  }

  return (
    <main className="acceso">
      <div className="acceso__tarjeta">
        <p className="acceso__marca">Punto Moto</p>
        <h1>Hola, {usuario.display_name}</h1>
        <p className="acceso__descripcion">Sesión abierta como {usuario.role_label}.</p>
        <button type="button" className="boton boton--secundario" onClick={alSalir} disabled={saliendo}>
          Cerrar sesión
        </button>
      </div>
    </main>
  )
}
