import type { UseQueryResult } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { CurrentCash, DailySettlement, Paginated, Product, Purchase } from '../../api/types'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { diaEnColombia, formatearDia, moverDia } from '../../utilidades/fechas'
import { Cargando } from './comun'
import { horaDe, plural } from './formato'
import { BloqueDeError, PieDeDatoEnCache } from './PanoramaPrincipal'

const A_LA_VISTA = 6

interface FilaDeAtencion {
  clave: string
  motivo: string
  detalle: string
  accionTexto: string
  ruta?: string
  alReintentar?: () => void
  esError?: boolean
}

/**
 * Categorías operativas que requieren acción del dueño, en orden fijo:
 * 1) existencias agotadas o en mínimo, 2) mecánicos de hoy por liquidar, 3) compras en borrador.
 * Cuenta categorías pendientes (no suma unidades, personas y documentos) y nunca declara que no hay pendientes si una consulta falló.
 */
export function NecesitaTuAtencion({
  existencias,
  liquidacion,
  borradores,
}: {
  existencias: UseQueryResult<Product[]>
  liquidacion: UseQueryResult<DailySettlement>
  borradores: UseQueryResult<Paginated<Purchase>>
}) {
  const idTitulo = useId()
  const filas: FilaDeAtencion[] = []
  let pendientesConfirmados = 0
  let errores = 0

  if (existencias.isError) {
    errores += 1
    filas.push({
      clave: 'existencias-error',
      motivo: 'No se pudieron consultar las existencias',
      detalle: 'Reintenta para comprobar agotados y productos en su mínimo.',
      accionTexto: 'Reintentar',
      alReintentar: () => void existencias.refetch(),
      esError: true,
    })
  } else if (existencias.isSuccess) {
    const productos = existencias.data
    const agotados = productos.filter((p) => p.stock <= 0).length
    const bajos = productos.filter((p) => p.stock > 0 && p.is_low_stock).length
    if (agotados + bajos > 0) {
      pendientesConfirmados += 1
      const motivo =
        agotados > 0 && bajos > 0
          ? `${plural(agotados, 'producto agotado', 'productos agotados')} y ${bajos} con existencia baja`
          : agotados > 0
            ? plural(agotados, 'producto agotado', 'productos agotados')
            : plural(bajos, 'producto con existencia baja', 'productos con existencia baja')
      filas.push({
        clave: 'existencias',
        motivo,
        detalle: `${plural(agotados + bajos, 'referencia activa', 'referencias activas')} para reponer`,
        accionTexto: 'Revisar productos',
        ruta: DESTINOS.productos.ruta,
      })
    }
  }

  if (liquidacion.isError) {
    errores += 1
    filas.push({
      clave: 'liquidacion-error',
      motivo: 'No se pudo consultar la liquidación de hoy',
      detalle: 'Reintenta para verificar servicios pendientes del taller.',
      accionTexto: 'Reintentar',
      alReintentar: () => void liquidacion.refetch(),
      esError: true,
    })
  } else if (liquidacion.isSuccess) {
    const mecanicosPendientes = (liquidacion.data.mechanics ?? []).filter((m) => m.services_count > 0)
    if (mecanicosPendientes.length > 0) {
      pendientesConfirmados += 1
      const servicios = mecanicosPendientes.reduce((suma, fila) => suma + fila.services_count, 0)
      const neto = liquidacion.data.total
      filas.push({
        clave: 'liquidacion',
        motivo: plural(mecanicosPendientes.length, 'mecánico de hoy por liquidar', 'mecánicos de hoy por liquidar'),
        detalle:
          neto > 0
            ? `${formatearPesos(neto)} · ${plural(servicios, 'servicio', 'servicios')}`
            : `${formatearPesos(0)} neto por descuentos · ${plural(servicios, 'servicio', 'servicios')}`,
        accionTexto: 'Liquidar',
        ruta: DESTINOS.liquidacion.ruta,
      })
    }
  }

  if (borradores.isError) {
    errores += 1
    filas.push({
      clave: 'borradores-error',
      motivo: 'No se pudieron consultar las compras en borrador',
      detalle: 'Reintenta para comprobar recepciones pendientes.',
      accionTexto: 'Reintentar',
      alReintentar: () => void borradores.refetch(),
      esError: true,
    })
  } else if (borradores.isSuccess && borradores.data.count > 0) {
    pendientesConfirmados += 1
    filas.push({
      clave: 'borradores',
      motivo: plural(borradores.data.count, 'compra en borrador', 'compras en borrador'),
      detalle: 'Sin recibir todavía en el inventario',
      accionTexto: 'Revisar borradores',
      ruta: `${DESTINOS.comprasLista.ruta}?status=draft&periodo=todas`,
    })
  }

  const algunaPendienteDeCarga = existencias.isPending || liquidacion.isPending || borradores.isPending
  const todoComprobadoSinPendientes =
    !algunaPendienteDeCarga && errores === 0 && pendientesConfirmados === 0
  const totalAsuntos = pendientesConfirmados + errores

  const etiquetaCabecera =
    totalAsuntos > 0
      ? plural(totalAsuntos, 'asunto', 'asuntos')
      : todoComprobadoSinPendientes
        ? 'Sin pendientes'
        : undefined

  return (
    <section className="panel-inicio panel-inicio--marca inicio-atencion" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Necesita tu atención
        </h2>
        {etiquetaCabecera && (
          <span
            className={`inicio-atencion__insignia${
              pendientesConfirmados > 0
                ? ' inicio-atencion__insignia--activa'
                : errores > 0
                  ? ' inicio-atencion__insignia--error'
                  : ''
            }`}
          >
            {etiquetaCabecera}
          </span>
        )}
      </div>
      {algunaPendienteDeCarga && filas.length === 0 ? (
        <div className="panel-inicio__cuerpo">
          <Cargando />
        </div>
      ) : todoComprobadoSinPendientes ? (
        <div className="panel-inicio__cuerpo inicio-atencion__limpio">
          <p className="inicio-atencion__estado">Sin pendientes de operación</p>
          <p className="inicio-atencion__explicacion">
            Se comprobaron productos en mínimo, mecánicos de hoy y compras en borrador.
          </p>
        </div>
      ) : (
        <ul className="inicio-atencion__lista">
          {filas.map((fila) => (
            <li
              key={fila.clave}
              className={`inicio-atencion__fila${fila.esError ? ' inicio-atencion__fila--error' : ''}`}
            >
              <div className="inicio-atencion__texto">
                <p className="inicio-atencion__motivo">{fila.motivo}</p>
                <p className="inicio-atencion__detalle">{fila.detalle}</p>
              </div>
              {fila.ruta ? (
                <Link to={fila.ruta} className="panel-inicio__enlace inicio-atencion__accion">
                  {fila.accionTexto}
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              ) : (
                <button
                  type="button"
                  className="boton boton--auto boton--secundario inicio-boton-reintentar"
                  onClick={fila.alReintentar}
                >
                  {fila.accionTexto}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Estado del cajón en negro con importe esperado en lima; nunca inventa $ 0 ante error o sesión ausente. */
export function ResumenDeCaja({ hoy, caja, enFranja = false }: { hoy: string; caja: UseQueryResult<CurrentCash>; enFranja?: boolean }) {
  const idTitulo = useId()
  const sesion = caja.data?.session
  const abierta = Boolean(caja.data?.is_open && sesion && typeof sesion.expected_cash === 'number')
  const diaApertura = sesion ? diaEnColombia(sesion.opened_at) : null
  const horaApertura = sesion ? horaDe(sesion.opened_at) : ''

  let textoApertura = ''
  if (sesion && diaApertura) {
    if (diaApertura === hoy) {
      textoApertura = `Abrió hoy${horaApertura ? ` a las ${horaApertura}` : ''}`
    } else if (diaApertura === moverDia(hoy, -1)) {
      textoApertura = `Abierta desde ayer${horaApertura ? ` a las ${horaApertura}` : ''}`
    } else {
      textoApertura = `Abierta desde el ${formatearDia(diaApertura)}${horaApertura ? ` a las ${horaApertura}` : ''}`
    }
  }

  return (
    <section
      className={enFranja ? 'inicio-celda-ventas inicio-celda-ventas--oscura inicio-celda-caja' : 'instrumento instrumento--oscuro inicio-caja-resumen'}
      aria-labelledby={idTitulo}
    >
      <div className={enFranja ? 'inicio-celda-ventas__cabecera' : 'instrumento__cabecera'}>
        <h2 id={idTitulo} className={enFranja ? 'inicio-celda-ventas__titulo' : 'inicio-caja-resumen__titulo'}>
          Caja
        </h2>
        {caja.data && !caja.isError && (
          <span className={enFranja ? 'inicio-celda-ventas__contexto' : 'instrumento__extra'}>
            {enFranja && abierta && textoApertura ? `${caja.data.is_open ? 'Abierta' : 'Cerrada'} · ${textoApertura}` : caja.data.is_open ? 'Abierta' : 'Cerrada'}
          </span>
        )}
      </div>
      {caja.isPending ? (
        <Cargando />
      ) : !caja.data ? (
        <BloqueDeError oscuro mensaje="No se pudo consultar la caja." alReintentar={() => void caja.refetch()} />
      ) : !caja.data.is_open ? (
        <>
          <p className={enFranja ? 'inicio-celda-caja__estado' : 'instrumento__estado'}>La caja está cerrada</p>
          <p className="instrumento__detalle">Ábrela para poder vender y registrar movimientos de efectivo.</p>
          {caja.isRefetchError && (
            <PieDeDatoEnCache oscuro actualizadoEn={caja.dataUpdatedAt} alReintentar={() => void caja.refetch()} />
          )}
          <div className={enFranja ? 'inicio-celda-ventas__pie' : 'instrumento__pie'}>
            <Link to={DESTINOS.cajaActual.ruta} className="boton boton--auto">
              Abrir caja
            </Link>
          </div>
        </>
      ) : !abierta || !sesion ? (
        <BloqueDeError
          oscuro
          mensaje="El importe de la caja no está disponible."
          alReintentar={() => void caja.refetch()}
        />
      ) : (
        <>
          <p className={enFranja ? 'inicio-celda-ventas__cifra' : 'instrumento__cifra instrumento__cifra--marca'}>{formatearPesos(sesion.expected_cash)}</p>
          <div className={enFranja ? 'inicio-celda-ventas__referencia' : undefined}>
            <span>
              Efectivo esperado en el cajón · Base de apertura:{' '}
              <strong className={enFranja ? 'inicio-celda-ventas__monto-ref' : undefined}>{formatearPesos(sesion.opening_cash)}</strong>
            </span>
          </div>
          {!enFranja && (
            <dl className="inicio-caja-resumen__datos">
              {textoApertura && (
                <div className="inicio-caja-resumen__fila">
                  <dt>Apertura</dt>
                  <dd>{textoApertura}</dd>
                </div>
              )}
              <div className="inicio-caja-resumen__fila">
                <dt>Base de apertura</dt>
                <dd>{formatearPesos(sesion.opening_cash)}</dd>
              </div>
            </dl>
          )}
          <p className="instrumento__detalle inicio-caja-resumen__nota">Las transferencias van fuera del cajón.</p>
          {caja.isRefetchError && (
            <PieDeDatoEnCache oscuro actualizadoEn={caja.dataUpdatedAt} alReintentar={() => void caja.refetch()} />
          )}
          <div className={enFranja ? 'inicio-celda-ventas__pie' : 'instrumento__pie'}>
            <Link to={DESTINOS.cajaActual.ruta} className="instrumento__enlace">
              Ver caja
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

/** Separa agotados (`stock <= 0`) de existencia baja (`stock > 0`) sin doble conteo y muestra la hora de revisión. */
export function ExistenciasPorReponer({ existencias }: { existencias: UseQueryResult<Product[]> }) {
  const idTitulo = useId()
  const productos = existencias.data ?? []
  const agotados = productos.filter((p) => p.stock <= 0).length
  const existenciaBaja = productos.filter((p) => p.stock > 0 && p.is_low_stock).length
  const restantes = productos.length - A_LA_VISTA
  const horaRevision =
    existencias.dataUpdatedAt > 0 ? horaDe(new Date(existencias.dataUpdatedAt).toISOString()) : ''

  return (
    <section className="panel-inicio panel-inicio--marca" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Existencias por reponer
        </h2>
        {horaRevision && !existencias.isError && (
          <span className="inicio-revision-hora">Revisado a las {horaRevision}</span>
        )}
      </div>
      {existencias.isPending ? (
        <p className="panel-inicio__vacio" aria-busy="true">
          Revisando las existencias…
        </p>
      ) : existencias.isError && !existencias.data ? (
        <div className="panel-inicio__cuerpo">
          <BloqueDeError
            mensaje="No se pudieron consultar las existencias."
            alReintentar={() => void existencias.refetch()}
          />
        </div>
      ) : productos.length === 0 ? (
        <div className="panel-inicio__cuerpo">
          <p className="inicio-existencias__vacio">Ningún producto activo está en su mínimo.</p>
          {existencias.isRefetchError && (
            <PieDeDatoEnCache
              actualizadoEn={existencias.dataUpdatedAt}
              alReintentar={() => void existencias.refetch()}
            />
          )}
          <div className="inicio-existencias__pie">
            <Link to={DESTINOS.productos.ruta} className="panel-inicio__enlace">
              Ver productos
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="inicio-existencias__resumen">
            <span className={agotados > 0 ? 'inicio-existencias__conteo inicio-existencias__conteo--agotado' : 'inicio-existencias__conteo'}>
              {plural(agotados, 'agotado', 'agotados')}
            </span>
            <span className="inicio-existencias__conteo">
              {plural(existenciaBaja, 'con existencia baja', 'con existencia baja')}
            </span>
          </div>
          <ul className="por-reponer inicio-existencias__lista">
            {productos.slice(0, A_LA_VISTA).map((producto) => (
              <li key={producto.id} className="por-reponer__fila inicio-existencias__fila">
                <span className="inicio-existencias__producto">
                  <span className="tabla__codigo">{producto.code}</span>
                  <span className="inicio-existencias__nombre">{producto.name}</span>
                </span>
                <span
                  className={
                    producto.stock <= 0 ? 'por-reponer__cifra por-reponer__cifra--agotado' : 'por-reponer__cifra'
                  }
                >
                  {producto.stock <= 0 ? 'Agotado' : `${producto.stock} / mínimo ${producto.min_stock}`}
                </span>
              </li>
            ))}
          </ul>
          {existencias.isRefetchError && (
            <div className="inicio-existencias__cache">
              <PieDeDatoEnCache
                actualizadoEn={existencias.dataUpdatedAt}
                alReintentar={() => void existencias.refetch()}
              />
            </div>
          )}
          <div className="por-reponer__pie">
            <Link to={DESTINOS.productos.ruta} className="panel-inicio__enlace">
              Ver productos
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
            {restantes > 0 && <span>{`y ${restantes} más`}</span>}
          </div>
        </>
      )}
    </section>
  )
}

/** Suma completa de `SaleReturn.total` registradas hoy, separadas de las ventas vigentes del día. */
export function DevolucionesDeHoy({
  devoluciones,
}: {
  devoluciones: UseQueryResult<{ total: number; cantidad: number }>
}) {
  const idTitulo = useId()
  const datos = devoluciones.data

  return (
    <section className="panel-inicio panel-inicio--marca" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Devoluciones de hoy
        </h2>
      </div>
      <div className="panel-inicio__cuerpo">
        {devoluciones.isPending ? (
          <Cargando />
        ) : !datos ? (
          <BloqueDeError
            mensaje="No se pudieron cargar las devoluciones de hoy."
            alReintentar={() => void devoluciones.refetch()}
          />
        ) : datos.cantidad === 0 ? (
          <>
            <p className="inicio-devoluciones__cero">No hay devoluciones hoy.</p>
            <p className="inicio-devoluciones__nota">
              Pueden corresponder a ventas de hoy o de fechas anteriores; no se descuentan de «Vendido hoy».
            </p>
            {devoluciones.isRefetchError && (
              <PieDeDatoEnCache
                actualizadoEn={devoluciones.dataUpdatedAt}
                alReintentar={() => void devoluciones.refetch()}
              />
            )}
            <div className="inicio-devoluciones__pie">
              <Link to={`${DESTINOS.devoluciones.ruta}?periodo=hoy`} className="panel-inicio__enlace">
                Ver devoluciones
                <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="inicio-devoluciones__cifra">{formatearPesos(datos.total)}</p>
            <p className="inicio-devoluciones__conteo">
              {plural(datos.cantidad, 'devolución registrada hoy', 'devoluciones registradas hoy')}
            </p>
            <p className="inicio-devoluciones__nota">
              Pueden corresponder a ventas de hoy o de fechas anteriores; no se descuentan de «Vendido hoy».
            </p>
            {devoluciones.isRefetchError && (
              <PieDeDatoEnCache
                actualizadoEn={devoluciones.dataUpdatedAt}
                alReintentar={() => void devoluciones.refetch()}
              />
            )}
            <div className="inicio-devoluciones__pie">
              <Link to={`${DESTINOS.devoluciones.ruta}?periodo=hoy`} className="panel-inicio__enlace">
                Ver devoluciones
                <ArrowRight aria-hidden="true" size={14} />
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
