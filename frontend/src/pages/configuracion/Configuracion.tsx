import { SeccionConPestanas } from '../../components/SeccionConPestanas'
import { MENU_CONFIGURACION } from '../../navegacion/destinos'

/** Marco de Configuración: pestañas según el rol y la subpantalla elegida. */
export function Configuracion() {
  return <SeccionConPestanas titulo="Configuración" destinos={MENU_CONFIGURACION} />
}
