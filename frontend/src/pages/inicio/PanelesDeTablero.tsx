import { ArrowRight } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { BotonDeFiltro } from '../../components/BarraDeFiltros'
import { useCajaActual } from '../../hooks/useCajaActual'
import { useVentasPorPeriodo, type PeriodoDeVentas } from '../../hooks/useVentasPorPeriodo'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos, pesosConSigno } from '../../utilidades/dinero'
import { NoSePudoCargar } from './comun'
import { CADA_MINUTO, plural } from './formato'
import { BarrasHorizontales, GraficaRitmoDiario, type FilaDeBarraHorizontal } from './Graficas'

function CargandoPanel() {
  return (
    <div className="panel-inicio__cuerpo inicio-panel-cargando" aria-busy="true">
      <span className="esqueleto instrumento__esqueleto-cifra" />
      <span className="esqueleto inicio-panel-cargando__grafica" />
    </div>
  )
}

/** Serie diaria de ventas de los últimos 7 o 30 días, sin contar las anuladas. */
export function RitmoDeVentas() {
  const idTitulo = useId()
  const [dias, setDias] = useState<PeriodoDeVentas>(7)
  const consulta = useVentasPorPeriodo(dias, CADA_MINUTO)
  const datos = consulta.data

  return (
    <section className="panel-inicio panel-inicio--marca" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Ritmo de ventas
        </h2>
        <div className="inicio-periodo" role="group" aria-label="Período de ventas">
          <BotonDeFiltro activo={dias === 7} onClick={() => setDias(7)}>
            7 días
          </BotonDeFiltro>
          <BotonDeFiltro activo={dias === 30} onClick={() => setDias(30)}>
            30 días
          </BotonDeFiltro>
        </div>
      </div>
      {consulta.isPending ? (
        <CargandoPanel />
      ) : consulta.isError || !datos ? (
        <div className="panel-inicio__cuerpo">
          <NoSePudoCargar />
        </div>
      ) : (
        <div className="panel-inicio__cuerpo">
          <dl className="inicio-cifras">
            <div className="inicio-cifras__celda">
              <dt>Vendido ({dias} días)</dt>
              <dd>{formatearPesos(datos.total)}</dd>
            </div>
            <div className="inicio-cifras__celda">
              <dt>Promedio diario</dt>
              <dd>{formatearPesos(datos.promedioDiario)}</dd>
            </div>
            <div className="inicio-cifras__celda">
              <dt>Mejor día{datos.mejorDia ? ` · ${datos.mejorDia.etiqueta}` : ''}</dt>
              <dd>{datos.mejorDia ? formatearPesos(datos.mejorDia.total) : 'Sin ventas'}</dd>
            </div>
          </dl>
          <GraficaRitmoDiario datos={datos} />
          <div className="inicio-leyenda">
            <div className="inicio-leyenda__items" aria-hidden="true">
              <span className="inicio-leyenda__muestra">
                <i className="inicio-leyenda__color inicio-leyenda__color--hoy" />
                Hoy
              </span>
              <span className="inicio-leyenda__muestra">
                <i className="inicio-leyenda__color inicio-leyenda__color--previo" />
                Días anteriores
              </span>
              <span className="inicio-leyenda__muestra">
                <i className="inicio-leyenda__linea" />
                Promedio diario
              </span>
            </div>
            <span>{plural(datos.cantidad, 'venta', 'ventas')} · sin anuladas</span>
          </div>
        </div>
      )}
    </section>
  )
}

/** Entradas y salidas de la sesión de caja abierta hoy, separando efectivo neto y transferencias. */
export function FlujoDeCaja() {
  const idTitulo = useId()
  const actual = useCajaActual(CADA_MINUTO)
  const sesion = actual.data?.session
  const abierta = actual.data?.is_open && sesion
  const resumen = sesion?.summary

  const entradas =
    resumen?.by_kind.reduce((suma, fila) => suma + Math.max(0, fila.cash) + Math.max(0, fila.transfer), 0) ?? 0
  const salidas =
    resumen?.by_kind.reduce(
      (suma, fila) => suma + Math.abs(Math.min(0, fila.cash)) + Math.abs(Math.min(0, fila.transfer)),
      0,
    ) ?? 0

  const filasActivas: FilaDeBarraHorizontal[] = (resumen?.by_kind ?? [])
    .map((fila) => ({ ...fila, neto: fila.cash + fila.transfer }))
    .filter((fila) => fila.neto !== 0)
    .sort((a, b) => {
      if (a.neto > 0 !== b.neto > 0) return a.neto > 0 ? -1 : 1
      return Math.abs(b.neto) - Math.abs(a.neto)
    })
    .map((fila, indice) => ({
      clave: fila.kind,
      rotulo: fila.kind_label,
      magnitud: Math.abs(fila.neto),
      valorFormateado: pesosConSigno(fila.neto),
      tono: fila.neto < 0 ? 'salida' : indice === 0 ? 'entrada' : 'suave',
    }))

  const textoAccesible = filasActivas.map((fila) => `${fila.rotulo} ${fila.valorFormateado}`).join(', ')

  return (
    <section className="panel-inicio panel-inicio--marca" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Flujo de la caja de hoy
        </h2>
        <Link to={DESTINOS.cajaActual.ruta} className="panel-inicio__enlace">
          Ver caja
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
      {actual.isPending ? (
        <CargandoPanel />
      ) : actual.isError ? (
        <div className="panel-inicio__cuerpo">
          <NoSePudoCargar />
        </div>
      ) : !abierta ? (
        <p className="panel-inicio__vacio">
          La caja está cerrada. Ábrela para ver cuánto entró y cuánto salió hoy por tipo y medio de pago.
        </p>
      ) : !resumen ? (
        <p className="panel-inicio__vacio">El resumen no está disponible en este momento.</p>
      ) : (
        <div className="panel-inicio__cuerpo">
          <dl className="inicio-cifras inicio-cifras--dos">
            <div className="inicio-cifras__celda">
              <dt>Entradas hoy</dt>
              <dd className={entradas > 0 ? 'inicio-cifras__valor--entrada' : undefined}>{pesosConSigno(entradas)}</dd>
            </div>
            <div className="inicio-cifras__celda">
              <dt>Salidas hoy</dt>
              <dd className={salidas > 0 ? 'inicio-cifras__valor--salida' : undefined}>
                {salidas > 0 ? pesosConSigno(-salidas) : formatearPesos(0)}
              </dd>
            </div>
          </dl>
          {filasActivas.length === 0 ? (
            <p className="inicio-flujo__vacio">Aún no hay movimientos registrados en esta sesión.</p>
          ) : (
            <BarrasHorizontales
              filas={filasActivas}
              etiquetaAccesible={`Movimientos de la caja de hoy: ${textoAccesible}`}
            />
          )}
          <div className="inicio-leyenda inicio-leyenda--pie">
            <span>
              Efectivo neto: <strong>{pesosConSigno(resumen.cash_total)}</strong>
            </span>
            <span>
              Transferencias: <strong>{pesosConSigno(resumen.transfer_total)}</strong>
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
