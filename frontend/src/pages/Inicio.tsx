import { ArrowRight, Plus, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { useCajaActual } from '../hooks/useCajaActual'
import { DESTINOS, puedeVer, type Destino } from '../navegacion/destinos'
import { formatearPesos } from '../utilidades/dinero'
import { saludoSegunHora } from '../utilidades/saludo'

// Lo que más se usa en el día, en el orden del mostrador. Cada rol ve solo lo que puede abrir.
const ACCESOS: readonly Destino[] = [DESTINOS.vender, DESTINOS.productos, DESTINOS.cajaActual, DESTINOS.liquidacion]

const formatoDeHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })

/** «8:02 a. m.»; vacío si la fecha no se puede leer, para no romper la pantalla. */
function horaDe(iso: string): string {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? '' : formatoDeHora.format(fecha)
}

export function Inicio() {
  const usuario = useUsuario()
  const esDueno = usuario.role === 'owner'
  const accesos = ACCESOS.filter((destino) => puedeVer(destino, usuario.role))
  // La hora del saludo se toma al entrar a Inicio.
  const [ahora] = useState(() => new Date())

  return (
    <section className="inicio">
      <div className="inicio__encabezado">
        <div>
          <h1>
            {saludoSegunHora(ahora)}, {usuario.display_name}
          </h1>
          <p className="texto-suave">{usuario.role_label} · todo listo para atender.</p>
        </div>
        <Link to={DESTINOS.vender.ruta} className="boton boton--auto boton--con-icono">
          <Plus aria-hidden="true" size={16} />
          Nueva venta
        </Link>
      </div>

      <nav aria-label="Accesos rápidos">
        <ul className="accesos-rapidos">
          {accesos.map((destino) => {
            const Icono = destino.icono
            return (
              <li key={destino.ruta}>
                <Link to={destino.ruta} className="acceso-rapido">
                  <span className="acceso-rapido__icono" aria-hidden="true">
                    <Icono size={18} strokeWidth={1.75} />
                  </span>
                  <span className="acceso-rapido__texto">
                    <span className="acceso-rapido__nombre">{destino.etiqueta}</span>
                    <span className="acceso-rapido__descripcion">{destino.descripcion}</span>
                  </span>
                  <ArrowRight className="acceso-rapido__flecha" aria-hidden="true" size={16} />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="inicio__tarjetas">
        {esDueno && <CajaDeHoy />}
      </div>
    </section>
  )
}

/** La caja de hoy, como un instrumento: el efectivo que debe haber en el cajón. Solo el dueño la ve. */
function CajaDeHoy() {
  const actual = useCajaActual()
  if (!actual.isSuccess) return null
  const sesion = actual.data.session
  return (
    <section className="tarjeta-caja" aria-labelledby="titulo-caja-de-hoy">
      <p id="titulo-caja-de-hoy" className="tarjeta-caja__titulo">
        <Wallet aria-hidden="true" size={14} />
        Caja de hoy
      </p>
      {actual.data.is_open && sesion ? (
        <>
          <p className="tarjeta-caja__cifra">{formatearPesos(sesion.expected_cash)}</p>
          <p className="tarjeta-caja__detalle">esperado en el cajón</p>
          <p className="tarjeta-caja__linea">
            Abrió con {formatearPesos(sesion.opening_cash)}
            {horaDe(sesion.opened_at) && ` a las ${horaDe(sesion.opened_at)}`}
          </p>
          <Link to={DESTINOS.cajaActual.ruta} className="tarjeta-caja__enlace">
            Ver la caja
            <ArrowRight aria-hidden="true" size={14} />
          </Link>
        </>
      ) : (
        <>
          <p className="tarjeta-caja__cerrada">La caja está cerrada</p>
          <p className="tarjeta-caja__detalle">Ábrela para poder vender y registrar el dinero de hoy.</p>
          <Link to={DESTINOS.cajaActual.ruta} className="boton boton--auto boton--con-icono tarjeta-caja__boton">
            Abrir caja
          </Link>
        </>
      )}
    </section>
  )
}
