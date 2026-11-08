import { Link } from 'react-router'
import { DESTINOS, type Destino } from '../../navegacion/destinos'
import { EncabezadoDeInicio } from './comun'
import { CajaDeHoy, Cuentas, MecanicosHoy, VentasDeHoy } from './Instrumentos'
import { FlujoDeCaja, RitmoDeVentas } from './PanelesDeTablero'
import { TablaDeVentas } from './TablaDeVentas'

const IR_A: readonly Destino[] = [DESTINOS.vender, DESTINOS.productos, DESTINOS.liquidacion, DESTINOS.comprasLista]

/** «Así va el día»: caja, ventas, mecánicos y cuentas, las últimas ventas y las pantallas más usadas. */
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
        <nav className="panel-inicio" aria-labelledby="titulo-ir-a">
          <div className="panel-inicio__cabecera">
            <h2 id="titulo-ir-a" className="panel-inicio__titulo">
              Ir a
            </h2>
          </div>
          <ul className="ir-a">
            {IR_A.map((destino) => {
              const Icono = destino.icono
              return (
                <li key={destino.ruta}>
                  <Link to={destino.ruta} className="ir-a__enlace">
                    <span className="ir-a__placa" aria-hidden="true">
                      <Icono size={16} strokeWidth={1.75} />
                    </span>
                    <span className="ir-a__texto">
                      <span className="ir-a__nombre">{destino.etiqueta}</span>
                      <span className="ir-a__descripcion">{destino.descripcion}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}
