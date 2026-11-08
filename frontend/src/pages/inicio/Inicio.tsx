import { useUsuario } from '../../auth/useUsuario'
import { InicioDelDueno } from './InicioDelDueno'
import { InicioDelVendedor } from './InicioDelVendedor'

/** Inicio: el dueño ve cómo va el día; el vendedor, lo necesario para atender rápido. */
export function Inicio() {
  return useUsuario().role === 'owner' ? <InicioDelDueno /> : <InicioDelVendedor />
}
