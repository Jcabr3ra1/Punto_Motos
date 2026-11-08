import { useEffect, useRef, useState } from 'react'
import type { VentasPorPeriodo } from '../../hooks/useVentasPorPeriodo'
import { formatearPesos } from '../../utilidades/dinero'
import { horaLegible, plural } from './formato'

function useAnchoDeGrafica(predeterminado: number) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [ancho, setAncho] = useState(predeterminado)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo) return
    const actualizar = (valor: number) => {
      const redondeado = Math.round(valor)
      if (redondeado >= 140) setAncho(redondeado)
    }
    actualizar(nodo.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver((entradas) => {
      for (const entrada of entradas) actualizar(entrada.contentRect.width)
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [])

  return { ref, ancho }
}

/** Barras por hora del día en SVG liviano, con la hora actual resaltada en oliva. */
export function GraficaVentasPorHora({
  porHora,
  horaActual,
  total,
  horaPico,
}: {
  porHora: { hora: number; total: number }[]
  horaActual: number
  total: number
  horaPico: { hora: number; total: number } | null
}) {
  const { ref, ancho } = useAnchoDeGrafica(280)
  const alto = 56
  const margenX = 2
  const arriba = 4
  const abajo = 18
  const anchoUtil = ancho - margenX * 2
  const altoUtil = alto - arriba - abajo
  const mayor = Math.max(1, ...porHora.map((item) => item.total))
  const paso = anchoUtil / Math.max(1, porHora.length)
  const anchoBarra = Math.max(6, Math.floor(paso * 0.68))

  const primera = porHora[0]?.hora ?? 8
  const ultima = porHora[porHora.length - 1]?.hora ?? 18
  const indiceMedio = porHora.findIndex((item) => item.hora === 12)
  const indicesRotulo = new Set([0, porHora.length - 1, ...(indiceMedio > 1 && indiceMedio < porHora.length - 2 ? [indiceMedio] : [])])

  const descripcion =
    total === 0
      ? `Ventas por hora de hoy, de ${horaLegible(primera)} a ${horaLegible(ultima)}: sin ventas registradas.`
      : `Ventas por hora de hoy, de ${horaLegible(primera)} a ${horaLegible(ultima)}: total ${formatearPesos(total)}${
          horaPico ? `, hora pico ${horaLegible(horaPico.hora)} con ${formatearPesos(horaPico.total)}` : ''
        }.`

  return (
    <svg ref={ref} className="inicio-svg inicio-svg--horas" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={descripcion}>
      <line x1={margenX} y1={arriba + altoUtil} x2={ancho - margenX} y2={arriba + altoUtil} stroke="#d4d2cc" strokeWidth="1" />
      {porHora.map(({ hora, total: monto }, indice) => {
        const altoBarra = monto === 0 ? 2 : Math.max(4, Math.round((monto / mayor) * altoUtil))
        const x = Math.round(margenX + indice * paso + (paso - anchoBarra) / 2)
        const y = arriba + altoUtil - altoBarra
        const esActual = hora === horaActual
        const esPico = horaPico?.hora === hora && monto > 0
        return (
          <g key={hora}>
            <rect
              x={x}
              y={y}
              width={anchoBarra}
              height={altoBarra}
              rx="1.5"
              fill={esActual ? '#4a5700' : esPico ? '#8e9c38' : '#cfd4b0'}
            >
              <title>{`${horaLegible(hora)}: ${formatearPesos(monto)}`}</title>
            </rect>
            {esActual && monto > 0 && <rect x={x} y={y} width={anchoBarra} height="2.5" fill="#cde409" />}
            {indicesRotulo.has(indice) && (
              <text
                x={indice === 0 ? margenX : indice === porHora.length - 1 ? ancho - margenX : x + anchoBarra / 2}
                y={alto - 3}
                textAnchor={indice === 0 ? 'start' : indice === porHora.length - 1 ? 'end' : 'middle'}
                fontSize="11"
                fill={esActual ? '#1d1f23' : '#5f636a'}
                fontWeight={esActual ? '600' : '400'}
              >
                {horaLegible(hora)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Serie diaria de los últimos 7 o 30 días con línea punteada del promedio diario. */
export function GraficaRitmoDiario({ datos }: { datos: VentasPorPeriodo }) {
  const { ref, ancho } = useAnchoDeGrafica(560)
  const alto = 148
  const izq = 2
  const der = 2
  const arriba = 16
  const abajo = 24
  const anchoUtil = ancho - izq - der
  const altoUtil = alto - arriba - abajo
  const mayor = Math.max(1, ...datos.porDia.map((dia) => dia.total))
  const paso = anchoUtil / datos.porDia.length
  const anchoBarra = Math.max(5, Math.floor(paso * (datos.dias === 30 ? 0.68 : 0.56)))
  const yPromedio = arriba + altoUtil - Math.round((datos.promedioDiario / mayor) * altoUtil)

  const indicesVisibles =
    datos.dias === 7
      ? new Set(datos.porDia.map((_, i) => i))
      : new Set([0, 7, 14, 21, datos.porDia.length - 1])

  const descripcion =
    datos.total === 0
      ? `Ritmo de ventas de los últimos ${datos.dias} días: sin ventas registradas.`
      : `Ritmo de ventas de los últimos ${datos.dias} días: total ${formatearPesos(datos.total)}, promedio diario ${formatearPesos(datos.promedioDiario)}${
          datos.mejorDia ? `, mejor día ${datos.mejorDia.etiquetaLarga} con ${formatearPesos(datos.mejorDia.total)}` : ''
        }.`

  return (
    <svg ref={ref} className="inicio-svg inicio-svg--ritmo" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={descripcion}>
      <line x1={izq} y1={arriba} x2={ancho - der} y2={arriba} stroke="#eeede8" strokeWidth="1" />
      <line x1={izq} y1={arriba + Math.round(altoUtil / 2)} x2={ancho - der} y2={arriba + Math.round(altoUtil / 2)} stroke="#eeede8" strokeWidth="1" />
      <line x1={izq} y1={arriba + altoUtil} x2={ancho - der} y2={arriba + altoUtil} stroke="#d4d2cc" strokeWidth="1" />
      {datos.total > 0 && (
        <text x={ancho - der} y={arriba - 4} textAnchor="end" fontSize="11" fill="#5f636a">
          Máx. {formatearPesos(mayor)}
        </text>
      )}
      {datos.porDia.map((dia, indice) => {
        const altoBarra = dia.total === 0 ? 2 : Math.max(4, Math.round((dia.total / mayor) * altoUtil))
        const x = Math.round(izq + indice * paso + (paso - anchoBarra) / 2)
        const y = arriba + altoUtil - altoBarra
        const esMejor = datos.mejorDia?.fecha === dia.fecha && dia.total > 0
        const color = dia.esHoy ? '#4a5700' : esMejor ? '#8e9c38' : '#cfd4b0'
        const mostrarEtiqueta = indicesVisibles.has(indice)
        const ultimoIndice = datos.porDia.length - 1
        const ancla = datos.dias === 30 && indice === 0 ? 'start' : datos.dias === 30 && indice === ultimoIndice ? 'end' : 'middle'
        const xTexto =
          datos.dias === 30 && indice === 0 ? izq : datos.dias === 30 && indice === ultimoIndice ? ancho - der : x + anchoBarra / 2
        return (
          <g key={dia.fecha}>
            <rect x={x} y={y} width={anchoBarra} height={altoBarra} rx="1.5" fill={color}>
              <title>{`${dia.etiquetaLarga}: ${formatearPesos(dia.total)} (${plural(dia.cantidad, 'venta', 'ventas')})`}</title>
            </rect>
            {dia.esHoy && dia.total > 0 && <rect x={x} y={y} width={anchoBarra} height="3" fill="#cde409" />}
            {mostrarEtiqueta && (
              <text
                x={xTexto}
                y={alto - 5}
                textAnchor={ancla}
                fontSize="11"
                fill={dia.esHoy ? '#1d1f23' : '#5f636a'}
                fontWeight={dia.esHoy ? '650' : '400'}
              >
                {dia.etiqueta}
              </text>
            )}
          </g>
        )
      })}
      {datos.promedioDiario > 0 && (
        <line
          x1={izq}
          y1={yPromedio}
          x2={ancho - der}
          y2={yPromedio}
          stroke="#4a5700"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  )
}

/** Barra horizontal de dos tramos proporcionales en SVG (cobros por medio o comparación de cuentas). */
export function BarraComparativa({
  izquierda,
  derecha,
  colorIzquierda,
  colorDerecha,
  fondoPista = '#e5e3dc',
  etiquetaAccesible,
}: {
  izquierda: number
  derecha: number
  colorIzquierda: string
  colorDerecha: string
  fondoPista?: string
  etiquetaAccesible: string
}) {
  const suma = izquierda + derecha
  const ancho = 240
  const anchoIzq = suma > 0 ? Math.round((izquierda / suma) * ancho) : 0
  const anchoDer = suma > 0 ? ancho - anchoIzq : 0
  return (
    <svg
      className="inicio-barra-comparativa"
      viewBox={`0 0 ${ancho} 8`}
      preserveAspectRatio="none"
      role="img"
      aria-label={etiquetaAccesible}
    >
      <rect x="0" y="0" width={ancho} height="8" rx="2" fill={fondoPista} />
      {anchoIzq > 0 && <rect x="0" y="0" width={anchoIzq} height="8" fill={colorIzquierda} />}
      {anchoDer > 0 && <rect x={anchoIzq} y="0" width={anchoDer} height="8" fill={colorDerecha} />}
    </svg>
  )
}

export interface FilaDeBarraHorizontal {
  clave: string
  rotulo: string
  magnitud: number
  valorFormateado: string
  tono?: 'entrada' | 'salida' | 'suave'
}

/** Lista compacta con barras proporcionales en SVG y montos tabulares a la derecha. */
export function BarrasHorizontales({
  filas,
  etiquetaAccesible,
  compacta = false,
}: {
  filas: readonly FilaDeBarraHorizontal[]
  etiquetaAccesible: string
  compacta?: boolean
}) {
  const mayor = Math.max(1, ...filas.map((fila) => fila.magnitud))
  return (
    <div className={`inicio-barras-h${compacta ? ' inicio-barras-h--compacta' : ''}`} role="img" aria-label={etiquetaAccesible}>
      {filas.map((fila) => {
        const anchoBarra = fila.magnitud <= 0 ? 2 : Math.max(4, Math.round((fila.magnitud / mayor) * 120))
        const color = fila.tono === 'salida' ? '#b3261e' : fila.tono === 'suave' ? '#8e9c38' : '#4a5700'
        return (
          <div key={fila.clave} className="inicio-barra-h">
            <span className="inicio-barra-h__rotulo" title={fila.rotulo}>
              {fila.rotulo}
            </span>
            <svg className="inicio-barra-h__pista" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width="120" height="8" rx="2" fill="#ecebe6" />
              <rect x="0" y="0" width={anchoBarra} height="8" rx="2" fill={color} />
            </svg>
            <span className={`inicio-barra-h__valor${fila.tono === 'salida' ? ' inicio-barra-h__valor--salida' : ''}`}>
              {fila.valorFormateado}
            </span>
          </div>
        )
      })}
    </div>
  )
}
