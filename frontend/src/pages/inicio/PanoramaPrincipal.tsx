import type { UseQueryResult } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import type { Consignee, CurrentCash, Supplier } from '../../api/types'
import { BotonDeFiltro } from '../../components/BarraDeFiltros'
import type { DatosDePanoramaDeVentas } from '../../hooks/usePanoramaDeVentas'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { diaEnColombia, formatearDia, formatearFechaHora, formatearIntervaloDeFechas, moverDia } from '../../utilidades/fechas'
import { Cargando } from './comun'
import { horaDe, plural } from './formato'
import { GraficaTendenciaDeVentas } from './Graficas'

export function BloqueDeError({
  mensaje,
  alReintentar,
  oscuro = false,
}: {
  mensaje: string
  alReintentar: () => void
  oscuro?: boolean
}) {
  return (
    <div className={`inicio-error-bloque${oscuro ? ' inicio-error-bloque--oscuro' : ''}`}>
      <p className="instrumento__error">{mensaje}</p>
      <button
        type="button"
        className={`boton boton--auto boton--secundario inicio-boton-reintentar${oscuro ? ' inicio-boton-reintentar--oscuro' : ''}`}
        onClick={alReintentar}
      >
        Reintentar
      </button>
    </div>
  )
}

export function PieDeDatoEnCache({
  actualizadoEn,
  alReintentar,
  oscuro = false,
}: {
  actualizadoEn: number
  alReintentar: () => void
  oscuro?: boolean
}) {
  if (actualizadoEn <= 0) return null
  const marca = formatearFechaHora(new Date(actualizadoEn).toISOString())
  return (
    <div className={`inicio-dato-previo${oscuro ? ' inicio-dato-previo--oscuro' : ''}`}>
      <span>Último dato válido: {marca} · No se pudo actualizar.</span>
      <button type="button" className="inicio-enlace-reintentar" onClick={alReintentar}>
        Reintentar
      </button>
    </div>
  )
}

/** Aviso antes de los indicadores solo si la sesión de caja abierta comenzó en una fecha anterior a hoy en Colombia. */
export function AvisoDeCajaAnterior({ hoy, caja }: { hoy: string; caja: UseQueryResult<CurrentCash> }) {
  const sesion = caja.data?.session
  if (!caja.data?.is_open || !sesion) return null
  const diaApertura = diaEnColombia(sesion.opened_at)
  if (!diaApertura || diaApertura >= hoy) return null

  const desdeTexto = diaApertura === moverDia(hoy, -1) ? 'ayer' : `el ${formatearDia(diaApertura)}`
  const horaTexto = horaDe(sesion.opened_at)

  return (
    <div className="inicio-aviso-caja" role="status">
      <AlertTriangle className="inicio-aviso-caja__icono" size={18} aria-hidden="true" />
      <p className="inicio-aviso-caja__texto">
        <strong>La caja sigue abierta desde {desdeTexto}</strong>
        {horaTexto ? ` (${horaTexto})` : ''}. Revísala y haz el arqueo antes de mezclar movimientos con otra jornada.
      </p>
      <Link to={DESTINOS.cajaActual.ruta} className="boton boton--auto boton--secundario">
        Revisar caja
      </Link>
    </div>
  )
}

/** Franja superior en dos celdas contiguas de igual altura: Vendido hoy (en negro) y Vendido este mes (en claro). */
export function FranjaDeVentas({
  hoy,
  actual,
  mesAnterior,
  intervaloMesAnterior,
}: {
  hoy: string
  actual: UseQueryResult<DatosDePanoramaDeVentas>
  mesAnterior: UseQueryResult<{ desde: string; hasta: string; total: number; cantidad: number }>
  intervaloMesAnterior: { desde: string; hasta: string }
}) {
  const idHoy = useId()
  const idMes = useId()
  const datos = actual.data
  const textoMesActual = datos ? formatearIntervaloDeFechas(datos.mes.desde, datos.mes.hasta, hoy) : ''
  const textoMesAnterior = formatearIntervaloDeFechas(intervaloMesAnterior.desde, intervaloMesAnterior.hasta, hoy)

  return (
    <div className="inicio-franja-ventas">
      <div className="inicio-franja-ventas__celdas">
        <section className="inicio-celda-ventas inicio-celda-ventas--oscura" aria-labelledby={idHoy}>
          <div className="inicio-celda-ventas__cabecera">
            <h2 id={idHoy} className="inicio-celda-ventas__titulo">
              Vendido hoy
            </h2>
            {datos && (
              <span className="inicio-celda-ventas__contexto">
                {plural(datos.hoy.cantidad, 'venta vigente', 'ventas vigentes')} · Día en curso
              </span>
            )}
          </div>
          {actual.isPending ? (
            <Cargando />
          ) : !datos ? (
            <BloqueDeError
              oscuro
              mensaje="No se pudieron cargar las ventas de hoy."
              alReintentar={() => void actual.refetch()}
            />
          ) : (
            <>
              <p className="inicio-celda-ventas__cifra">{formatearPesos(datos.hoy.total)}</p>
              <div className="inicio-celda-ventas__referencia">
                <span>Ayer completo ({formatearIntervaloDeFechas(datos.ayer.fecha, datos.ayer.fecha, hoy)})</span>
                <strong className="inicio-celda-ventas__monto-ref">{formatearPesos(datos.ayer.total)}</strong>
              </div>
              {actual.isRefetchError && (
                <PieDeDatoEnCache oscuro actualizadoEn={actual.dataUpdatedAt} alReintentar={() => void actual.refetch()} />
              )}
              <div className="inicio-celda-ventas__pie">
                <Link to={`${DESTINOS.ventas.ruta}?periodo=hoy&voided=false`} className="instrumento__enlace">
                  Ver ventas de hoy
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </>
          )}
        </section>

        <section className="inicio-celda-ventas" aria-labelledby={idMes}>
          <div className="inicio-celda-ventas__cabecera">
            <h2 id={idMes} className="inicio-celda-ventas__titulo">
              Vendido este mes
            </h2>
            {datos && (
              <span className="inicio-celda-ventas__contexto">
                {textoMesActual} · {plural(datos.mes.cantidad, 'venta', 'ventas')}
              </span>
            )}
          </div>
          {actual.isPending ? (
            <Cargando />
          ) : !datos ? (
            <BloqueDeError
              mensaje="No se pudieron cargar las ventas del mes."
              alReintentar={() => void actual.refetch()}
            />
          ) : (
            <>
              <p className="inicio-celda-ventas__cifra">{formatearPesos(datos.mes.total)}</p>
              <div className="inicio-celda-ventas__referencia">
                <span>{textoMesAnterior} · días completos</span>
                {mesAnterior.isPending ? (
                  <span className="esqueleto instrumento__esqueleto-monto" aria-busy="true" />
                ) : !mesAnterior.data ? (
                  <span className="inicio-celda-ventas__ref-error">
                    No se pudo comparar ·{' '}
                    <button type="button" className="inicio-enlace-reintentar" onClick={() => void mesAnterior.refetch()}>
                      Reintentar
                    </button>
                  </span>
                ) : (
                  <strong className="inicio-celda-ventas__monto-ref">{formatearPesos(mesAnterior.data.total)}</strong>
                )}
              </div>
              {actual.isRefetchError && (
                <PieDeDatoEnCache actualizadoEn={actual.dataUpdatedAt} alReintentar={() => void actual.refetch()} />
              )}
              {!actual.isRefetchError && mesAnterior.isRefetchError && (
                <PieDeDatoEnCache actualizadoEn={mesAnterior.dataUpdatedAt} alReintentar={() => void mesAnterior.refetch()} />
              )}
              <div className="inicio-celda-ventas__pie">
                <Link to={`${DESTINOS.ventas.ruta}?periodo=mes&voided=false`} className="instrumento__enlace">
                  Ver ventas del mes
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
      <p className="inicio-franja-ventas__nota">
        Ventas sin anuladas. Devoluciones aparte. Hoy sigue en curso; ayer y los días anteriores están completos.
      </p>
    </div>
  )
}

/** Serie diaria en SVG para «7 días» (al abrir) o «Este mes», compartiendo la consulta del panorama. */
export function TendenciaDeVentas({
  hoy,
  actual,
}: {
  hoy: string
  actual: UseQueryResult<DatosDePanoramaDeVentas>
}) {
  const idTitulo = useId()
  const [periodo, setPeriodo] = useState<'7dias' | 'mes'>('7dias')
  const datos = actual.data
  const tramo = periodo === '7dias' ? datos?.sieteDias : datos?.mes
  const intervaloTexto = tramo ? formatearIntervaloDeFechas(tramo.desde, tramo.hasta, hoy) : ''

  return (
    <section className="panel-inicio panel-inicio--marca" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Cómo vienen las ventas
        </h2>
        <div className="inicio-periodo" role="group" aria-label="Período de la gráfica de ventas">
          <BotonDeFiltro activo={periodo === '7dias'} onClick={() => setPeriodo('7dias')}>
            7 días
          </BotonDeFiltro>
          <BotonDeFiltro activo={periodo === 'mes'} onClick={() => setPeriodo('mes')}>
            Este mes
          </BotonDeFiltro>
        </div>
      </div>
      {actual.isPending ? (
        <div className="panel-inicio__cuerpo inicio-panel-cargando" aria-busy="true">
          <span className="esqueleto instrumento__esqueleto-cifra" />
          <span className="esqueleto inicio-panel-cargando__grafica" />
        </div>
      ) : actual.isError && !tramo ? (
        <div className="panel-inicio__cuerpo">
          <BloqueDeError mensaje="No se pudieron cargar las ventas del período." alReintentar={() => void actual.refetch()} />
        </div>
      ) : tramo ? (
        <div className="panel-inicio__cuerpo">
          <dl className="inicio-cifras inicio-cifras--dos inicio-cifras--panorama">
            <div className="inicio-cifras__celda">
              <dt>
                Total del período · {intervaloTexto} ({plural(tramo.cantidad, 'venta', 'ventas')})
              </dt>
              <dd>{formatearPesos(tramo.total)}</dd>
            </div>
            <div className="inicio-cifras__celda">
              <dt>
                Mejor día
                {tramo.mejorDia
                  ? ` · ${formatearIntervaloDeFechas(tramo.mejorDia.fecha, tramo.mejorDia.fecha, hoy)}${tramo.mejorDia.esHoy ? ' (en curso)' : ''}`
                  : ''}
              </dt>
              <dd>{tramo.mejorDia ? formatearPesos(tramo.mejorDia.total) : 'Sin ventas'}</dd>
            </div>
          </dl>
          <GraficaTendenciaDeVentas
            serie={tramo.serie}
            intervaloTexto={intervaloTexto}
            total={tramo.total}
            mejorDia={tramo.mejorDia}
            periodo={periodo}
          />
          <div className="inicio-leyenda">
            <div className="inicio-leyenda__items" aria-hidden="true">
              <span className="inicio-leyenda__muestra">
                <i className="inicio-leyenda__color inicio-leyenda__color--previo" />
                Días completos
              </span>
              <span className="inicio-leyenda__muestra">
                <i className="inicio-leyenda__color inicio-leyenda__color--hoy" />
                Hoy en curso
              </span>
            </div>
            <span>Suma de ventas vigentes (repuestos y servicios)</span>
          </div>
          {actual.isRefetchError && (
            <PieDeDatoEnCache actualizadoEn={actual.dataUpdatedAt} alReintentar={() => void actual.refetch()} />
          )}
        </div>
      ) : null}
    </section>
  )
}

/** Dos importes independientes, sin compensarse entre sí ni mostrarse como dinero disponible. */
export function CuentasDelNegocio({
  proveedores,
  locales,
}: {
  proveedores: UseQueryResult<Supplier[]>
  locales: UseQueryResult<Consignee[]>
}) {
  const idTitulo = useId()
  const totalProveedores = proveedores.data?.reduce((suma, uno) => suma + uno.balance_due, 0) ?? 0
  const totalLocales = locales.data?.reduce((suma, uno) => suma + uno.balance_due, 0) ?? 0

  return (
    <section className="panel-inicio panel-inicio--marca" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Cuentas del negocio
        </h2>
      </div>
      <div className="inicio-cuentas">
        <div className="inicio-cuentas__columna">
          <p className="inicio-cuentas__rotulo">Debo a proveedores</p>
          {proveedores.isPending ? (
            <Cargando />
          ) : !proveedores.data ? (
            <BloqueDeError
              mensaje="No se pudieron cargar los proveedores."
              alReintentar={() => void proveedores.refetch()}
            />
          ) : (
            <>
              <p className="inicio-cuentas__cifra">{formatearPesos(totalProveedores)}</p>
              <p className="inicio-cuentas__detalle">
                {proveedores.data.length === 0
                  ? 'Sin saldo pendiente con proveedores'
                  : plural(proveedores.data.length, 'proveedor con saldo', 'proveedores con saldo')}
              </p>
              {proveedores.isRefetchError && (
                <PieDeDatoEnCache
                  actualizadoEn={proveedores.dataUpdatedAt}
                  alReintentar={() => void proveedores.refetch()}
                />
              )}
              <div className="inicio-cuentas__pie">
                <Link to={DESTINOS.proveedores.ruta} className="panel-inicio__enlace">
                  Ver proveedores
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="inicio-cuentas__columna">
          <p className="inicio-cuentas__rotulo">Me deben los locales</p>
          {locales.isPending ? (
            <Cargando />
          ) : !locales.data ? (
            <BloqueDeError
              mensaje="No se pudieron cargar los locales."
              alReintentar={() => void locales.refetch()}
            />
          ) : (
            <>
              <p className="inicio-cuentas__cifra">{formatearPesos(totalLocales)}</p>
              <p className="inicio-cuentas__detalle">
                {locales.data.length === 0
                  ? 'Sin saldo pendiente en consignación'
                  : plural(locales.data.length, 'local con saldo', 'locales con saldo')}
              </p>
              {locales.isRefetchError && (
                <PieDeDatoEnCache actualizadoEn={locales.dataUpdatedAt} alReintentar={() => void locales.refetch()} />
              )}
              <div className="inicio-cuentas__pie">
                <Link to={DESTINOS.locales.ruta} className="panel-inicio__enlace">
                  Ver locales
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
