import { Link } from 'react-router'
import { DESTINOS } from '../../navegacion/destinos'
import { EncabezadoDeInicio } from './comun'
import { CajaDeHoy, Cuentas, MecanicosHoy, VentasDeHoy } from './Instrumentos'
import { FlujoDeCaja, RitmoDeVentas } from './PanelesDeTablero'
import { PorReponer } from './PorReponer'
import { TablaDeVentas } from './TablaDeVentas'

/** «Así va el día»: caja, ventas, mecánicos y cuentas, las últimas ventas y lo que se está acabando. */
export function InicioDelDueno() {
  return (
    <div className="inicio">
      <EncabezadoDeInicio
        subtitulo="así va el día"
        acciones={
          <Link to={DESTINOS.comprasLista.ruta} className="boton boton--auto boton--secundario">
            Recibir compra
          </Link>
        }
      />
      <div className="inicio__instrumentos">
        <CajaDeHoy />
        <VentasDeHoy />
        <MecanicosHoy />
        <Cuentas />
      </div>
      <div className="inicio__tablero">
        <RitmoDeVentas />
        <FlujoDeCaja />
      </div>
      <div className="inicio__abajo">
        <TablaDeVentas titulo="Últimas ventas de hoy" cuantas={5} completa />
        <PorReponer />
      </div>
    </div>
  )
}
