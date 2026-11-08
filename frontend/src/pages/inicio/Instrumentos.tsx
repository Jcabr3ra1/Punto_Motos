import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { listarProveedores } from '../../api/compras'
import { listarLocales } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { consultarLiquidacionDelDia } from '../../api/taller'
import { useCajaActual } from '../../hooks/useCajaActual'
import { useHoy } from '../../hooks/useHoy'
import { useVentasDeHoy } from '../../hooks/useVentasDeHoy'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { Cargando, Instrumento, NoSePudoCargar } from './comun'
import { CADA_MINUTO, horaDe, horaLegible, plural } from './formato'
import { BarraComparativa, BarrasHorizontales, GraficaVentasPorHora } from './Graficas'

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
  const actual = useCajaActual(CADA_MINUTO)
  const sesion = actual.data?.session
  const abierta = actual.data?.is_open && sesion
  const resumen = sesion?.summary
  const cobradoEfectivo = resumen?.by_kind.reduce((suma, fila) => suma + Math.max(0, fila.cash), 0) ?? 0
  const cobradoTransferencia = resumen?.by_kind.reduce((suma, fila) => suma + Math.max(0, fila.transfer), 0) ?? 0
  const totalCobrado = cobradoEfectivo + cobradoTransferencia
  const porcentajeEfectivo = totalCobrado > 0 ? Math.round((cobradoEfectivo / totalCobrado) * 100) : 0
  const porcentajeTransferencia = totalCobrado > 0 ? 100 - porcentajeEfectivo : 0

  return (
    <Instrumento
      id="instrumento-caja"
      titulo="Caja de hoy"
      extra={actual.isSuccess ? (abierta ? 'Abierta' : 'Cerrada') : undefined}
      oscuro
      pie={
        actual.isSuccess &&
        (abierta ? (
          <IrA a={DESTINOS.cajaActual.ruta}>Ver la caja</IrA>
        ) : (
          <Link to={DESTINOS.cajaActual.ruta} className="boton boton--auto">
            Abrir caja
          </Link>
        ))
      }
    >
      {actual.isPending ? (
        <Cargando />
      ) : actual.isError ? (
        <NoSePudoCargar />
      ) : abierta ? (
        <>
          <p className="instrumento__cifra instrumento__cifra--marca">{formatearPesos(sesion.expected_cash)}</p>
          {/* Dos líneas que no se parten por dentro: qué es la cifra y cuándo abrió la caja. */}
          <p className="instrumento__detalle">esperado en el cajón</p>
          <p className="instrumento__detalle instrumento__detalle--entero">
            Abrió con {formatearPesos(sesion.opening_cash)}
            {horaDe(sesion.opened_at) && ` a las ${horaDe(sesion.opened_at)}`}
          </p>
          {!resumen ? (
            <p className="instrumento__detalle">Resumen de cobros no disponible</p>
          ) : totalCobrado > 0 ? (
            <>
              <BarraComparativa
                izquierda={cobradoEfectivo}
                derecha={cobradoTransferencia}
                colorIzquierda="#cde409"
                colorDerecha="#6e7552"
                fondoPista="#262728"
                etiquetaAccesible={`Cobros de hoy: ${porcentajeEfectivo} % en efectivo (${formatearPesos(cobradoEfectivo)}) y ${porcentajeTransferencia} % por transferencia (${formatearPesos(cobradoTransferencia)})`}
              />
              {/* Leyenda de la barra: cada parte con el color de su tramo y sin partirse por dentro. */}
              <p className="instrumento__detalle leyenda-de-cobro">
                <span className="leyenda-de-cobro__parte">
                  <span className="leyenda-de-cobro__color" style={{ background: '#cde409' }} aria-hidden="true" />
                  Efectivo {porcentajeEfectivo}&nbsp;%
                </span>
                <span className="leyenda-de-cobro__parte">
                  <span className="leyenda-de-cobro__color" style={{ background: '#6e7552' }} aria-hidden="true" />
                  Transferencia {porcentajeTransferencia}&nbsp;%
                </span>
              </p>
            </>
          ) : (
            <p className="instrumento__detalle">Sin cobros registrados aún</p>
          )}
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

/** Cuántas ventas van hoy, por cuánto y una gráfica SVG de barras por hora. */
export function VentasDeHoy() {
  const ventas = useVentasDeHoy(CADA_MINUTO)
  const datos = ventas.data
  // La hora que se resalta en la gráfica se toma al abrir Inicio.
  const [horaActual] = useState(() =>
    Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(new Date())),
  )
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
          <GraficaVentasPorHora
            porHora={datos!.porHora}
            horaActual={horaActual}
            total={datos!.total}
            horaPico={datos!.horaPico}
          />
          <p className="instrumento__detalle">
            por hora, de {rango}
            {datos!.horaPico ? ` · pico ${horaLegible(datos!.horaPico.hora)}` : ''}
            {datos!.conTaller > 0 ? ` · ${datos!.conTaller} con taller` : ''}
          </p>
        </>
      )}
    </Instrumento>
  )
}

/** Lo que hay que pagarles hoy a los mecánicos, con barras proporcionales por persona. */
export function MecanicosHoy() {
  const hoy = useHoy()
  const dia = useQuery({
    queryKey: [...claves.liquidaciones, 'dia', hoy],
    queryFn: ({ signal }) => consultarLiquidacionDelDia(hoy, signal),
    refetchInterval: CADA_MINUTO,
  })
  const filas = dia.data?.mechanics ?? []
  const servicios = filas.reduce((suma, fila) => suma + fila.services_count, 0)
  const visibles = filas.slice(0, 3)

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
          {visibles.length > 0 && (
            <BarrasHorizontales
              compacta
              filas={visibles.map((fila, indice) => ({
                clave: String(fila.mechanic.id),
                rotulo: fila.mechanic.name,
                magnitud: fila.amount,
                valorFormateado: formatearPesos(fila.amount),
                tono: indice === 0 ? 'entrada' : 'suave',
              }))}
              etiquetaAccesible={`Por pagar hoy por mecánico: ${filas.map((f) => `${f.mechanic.name} ${formatearPesos(f.amount)}`).join(', ')}`}
            />
          )}
          {filas.length > 3 && <p className="instrumento__detalle">y {plural(filas.length - 3, 'mecánico más', 'mecánicos más')}</p>}
        </>
      )}
    </Instrumento>
  )
}

/** Lo que se les debe a los proveedores y lo que deben los locales. Son listas sin paginar: la suma es exacta. */
export function Cuentas() {
  const proveedores = useQuery({
    queryKey: [...claves.proveedores, 'con-deuda'],
    queryFn: ({ signal }) => listarProveedores({ with_debt: true, include_inactive: true }, signal),
    refetchInterval: CADA_MINUTO,
  })
  const locales = useQuery({
    queryKey: [...claves.consignacion, 'locales', 'con-deuda'],
    queryFn: ({ signal }) => listarLocales({ with_debt: true, include_inactive: true }, signal),
    refetchInterval: CADA_MINUTO,
  })

  const totalProveedores = proveedores.data?.reduce((suma, uno) => suma + uno.balance_due, 0) ?? 0
  const totalLocales = locales.data?.reduce((suma, uno) => suma + uno.balance_due, 0) ?? 0
  const listasListas = proveedores.isSuccess && locales.isSuccess

  const fila = (rotulo: string, consulta: typeof proveedores | typeof locales, total: number) => (
    <div className="instrumento__fila">
      <dt>{rotulo}</dt>
      <dd>
        {consulta.isPending ? (
          <span className="esqueleto instrumento__esqueleto-monto" aria-busy="true" />
        ) : consulta.isError ? (
          <span className="instrumento__error">No se pudo cargar</span>
        ) : (
          formatearPesos(total)
        )}
      </dd>
    </div>
  )

  return (
    <Instrumento id="instrumento-cuentas" titulo="Cuentas" pie={<IrA a={DESTINOS.proveedores.ruta}>Ver proveedores</IrA>}>
      <dl className="instrumento__lista">
        {fila('Debo a proveedores', proveedores, totalProveedores)}
        {fila('Me deben los locales', locales, totalLocales)}
      </dl>
      {listasListas && (
        <>
          <BarraComparativa
            izquierda={totalProveedores}
            derecha={totalLocales}
            colorIzquierda="#0b0b0c"
            colorDerecha="#4a5700"
            etiquetaAccesible={`Comparación de cuentas: debo a proveedores ${formatearPesos(totalProveedores)} frente a ${formatearPesos(totalLocales)} que deben los locales`}
          />
          <p className="instrumento__detalle">
            {totalProveedores + totalLocales === 0
              ? 'Sin saldos pendientes'
              : `${plural(proveedores.data.length, 'proveedor', 'proveedores')} · ${plural(locales.data.length, 'local', 'locales')}`}
          </p>
        </>
      )}
    </Instrumento>
  )
}
