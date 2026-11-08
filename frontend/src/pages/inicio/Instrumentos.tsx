import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { listarProveedores } from '../../api/compras'
import { listarLocales } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { consultarLiquidacionDelDia } from '../../api/taller'
import { useCajaActual } from '../../hooks/useCajaActual'
import { useVentasDeHoy } from '../../hooks/useVentasDeHoy'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { hoyEnColombia } from '../../utilidades/fechas'
import { Cargando, Instrumento, NoSePudoCargar } from './comun'
import { CADA_MINUTO, horaDe } from './formato'

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

function IrA({ a, children }: { a: string; children: string }) {
  return (
    <Link to={a} className="instrumento__enlace">
      {children}
      <ArrowRight aria-hidden="true" size={14} />
    </Link>
  )
}

/** El efectivo que debe haber en el cajón, en negro como un instrumento del tablero. */
export function CajaDeHoy() {
  const actual = useCajaActual()
  const sesion = actual.data?.session
  const abierta = actual.data?.is_open && sesion
  return (
    <Instrumento
      id="instrumento-caja"
      titulo="Caja de hoy"
      oscuro
      pie={actual.isSuccess && (abierta ? <IrA a={DESTINOS.cajaActual.ruta}>Ver la caja</IrA> : (
        <Link to={DESTINOS.cajaActual.ruta} className="boton boton--auto">
          Abrir caja
        </Link>
      ))}
    >
      {actual.isPending ? (
        <Cargando />
      ) : actual.isError ? (
        <NoSePudoCargar />
      ) : abierta ? (
        <>
          <p className="instrumento__cifra">{formatearPesos(sesion.expected_cash)}</p>
          <p className="instrumento__detalle">esperado en el cajón</p>
          <p className="instrumento__detalle">
            Abrió con {formatearPesos(sesion.opening_cash)}
            {horaDe(sesion.opened_at) && ` a las ${horaDe(sesion.opened_at)}`}
          </p>
        </>
      ) : (
        <>
          <p className="instrumento__estado">La caja está cerrada</p>
          <p className="instrumento__detalle">Ábrela para poder vender y registrar el dinero de hoy.</p>
        </>
      )}
    </Instrumento>
  )
}

/** Cuántas ventas van hoy, por cuánto y un gráfico de barras por hora. */
export function VentasDeHoy() {
  const ventas = useVentasDeHoy(CADA_MINUTO)
  const datos = ventas.data
  const mayor = Math.max(1, ...(datos?.porHora.map((h) => h.total) ?? []))
  // La hora que se resalta en la gráfica se toma al abrir Inicio.
  const [horaActual] = useState(() => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(new Date())))
  const rango = datos && `${horaLegible(datos.porHora[0].hora)} a ${horaLegible(datos.porHora[datos.porHora.length - 1].hora)}`
  return (
    <Instrumento
      id="instrumento-ventas"
      titulo="Ventas de hoy"
      extra={datos && plural(datos.cantidad, 'venta', 'ventas')}
      pie={<IrA a={DESTINOS.ventas.ruta}>Ver las ventas</IrA>}
    >
      {ventas.isPending ? (
        <Cargando />
      ) : ventas.isError ? (
        <NoSePudoCargar />
      ) : (
        <>
          <p className="instrumento__cifra">{formatearPesos(datos!.total)}</p>
          <div className="grafica-horas" aria-hidden="true">
            {datos!.porHora.map(({ hora, total }) => (
              <span
                key={hora}
                className={`grafica-horas__barra${hora === horaActual ? ' grafica-horas__barra--ahora' : ''}`}
                style={{ height: `${Math.round((total / mayor) * 100)}%` }}
              />
            ))}
          </div>
          <p className="instrumento__detalle">por hora, de {rango}</p>
        </>
      )}
    </Instrumento>
  )
}

/** «8 a. m.», «6 p. m.». */
function horaLegible(hora: number): string {
  const doce = hora % 12 === 0 ? 12 : hora % 12
  return `${doce} ${hora < 12 ? 'a. m.' : 'p. m.'}`
}

/** Lo que hay que pagarles hoy a los mecánicos. */
export function MecanicosHoy() {
  const hoy = hoyEnColombia()
  const dia = useQuery({
    queryKey: [...claves.liquidaciones, 'dia', hoy],
    queryFn: ({ signal }) => consultarLiquidacionDelDia(hoy, signal),
    refetchInterval: CADA_MINUTO,
  })
  const filas = dia.data?.mechanics ?? []
  const servicios = filas.reduce((suma, fila) => suma + fila.services_count, 0)
  return (
    <Instrumento id="instrumento-mecanicos" titulo="Mecánicos hoy" pie={<IrA a={DESTINOS.liquidacion.ruta}>Liquidar</IrA>}>
      {dia.isPending ? (
        <Cargando />
      ) : dia.isError ? (
        <NoSePudoCargar />
      ) : (
        <>
          <p className="instrumento__cifra">{formatearPesos(dia.data.total)}</p>
          <p className="instrumento__detalle">
            {filas.length === 0
              ? 'Nada por pagar hoy'
              : `por pagar a ${plural(filas.length, 'mecánico', 'mecánicos')} · ${plural(servicios, 'servicio', 'servicios')}`}
          </p>
        </>
      )}
    </Instrumento>
  )
}

/** Lo que se les debe a los proveedores y lo que deben los locales. Son listas sin paginar: la suma es exacta. */
export function Cuentas() {
  const proveedores = useQuery({
    queryKey: [...claves.proveedores, 'con-deuda'],
    queryFn: ({ signal }) => listarProveedores({ with_debt: true }, signal),
    refetchInterval: CADA_MINUTO,
  })
  const locales = useQuery({
    queryKey: [...claves.consignacion, 'locales', 'con-deuda'],
    queryFn: ({ signal }) => listarLocales({ with_debt: true }, signal),
    refetchInterval: CADA_MINUTO,
  })
  const fila = (rotulo: string, consulta: typeof proveedores | typeof locales) => (
    <div className="instrumento__fila">
      <dt>{rotulo}</dt>
      <dd>
        {consulta.isPending ? (
          <span className="esqueleto instrumento__esqueleto-monto" aria-busy="true" />
        ) : consulta.isError ? (
          <span className="instrumento__error">No se pudo cargar</span>
        ) : (
          formatearPesos(consulta.data.reduce((suma, uno) => suma + uno.balance_due, 0))
        )}
      </dd>
    </div>
  )
  return (
    <Instrumento id="instrumento-cuentas" titulo="Cuentas" pie={<IrA a={DESTINOS.proveedores.ruta}>Ver proveedores</IrA>}>
      <dl className="instrumento__lista">
        {fila('Debo a proveedores', proveedores)}
        {fila('Me deben los locales', locales)}
      </dl>
    </Instrumento>
  )
}
