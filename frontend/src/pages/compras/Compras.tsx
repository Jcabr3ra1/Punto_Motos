import { SeccionConPestanas } from '../../components/SeccionConPestanas'
import { MENU_COMPRAS } from '../../navegacion/destinos'

/** Marco de Compras (solo el dueño): compras, proveedores y abonos. */
export function Compras() {
  return <SeccionConPestanas titulo="Compras" destinos={MENU_COMPRAS} />
}
