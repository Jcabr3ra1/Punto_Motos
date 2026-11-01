import type { ReactNode } from 'react'
import { useUsuario } from '../auth/useUsuario'
import type { NivelDeTitulo } from '../components/Titulo'
import { puedeVer, type Destino } from '../navegacion/destinos'
import { SinPermiso } from '../pages/SinPermiso'

/** Muestra la pantalla solo si el rol del usuario puede verla. */
export function Permiso({
  destino,
  nivel,
  children,
}: {
  destino: Destino
  /** Nivel del título del aviso, para que coincida con el de la pantalla que reemplaza. */
  nivel?: NivelDeTitulo
  children: ReactNode
}) {
  const usuario = useUsuario()
  return puedeVer(destino, usuario.role) ? children : <SinPermiso nivel={nivel} />
}
