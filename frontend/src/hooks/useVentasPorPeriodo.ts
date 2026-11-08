import { useQuery } from '@tanstack/react-query'
import { claves } from '../api/consultas'
import { listarVentas } from '../api/ventas'
import { diaEnColombia, etiquetaCortaDeDia, formatearDia, moverDia } from '../utilidades/fechas'
import { useHoy } from './useHoy'

export type PeriodoDeVentas = 7 | 30

export interface DiaDeVentas {
  fecha: string
  etiqueta: string
  etiquetaLarga: string
  total: number
  cantidad: number
  esHoy: boolean
}

export interface VentasPorPeriodo {
  dias: PeriodoDeVentas
  desde: string
  hasta: string
  total: number
  cantidad: number
  promedioDiario: number
  mejorDia: DiaDeVentas | null
  porDia: DiaDeVentas[]
}

const POR_PAGINA = 200

/**
 * Ventas no anuladas de los últimos 7 o 30 días en Colombia, agrupadas por día calendario.
 * Recorre todas las páginas para no truncar el total cuando hay más de 200 ventas en el período.
 */
export function useVentasPorPeriodo(dias: PeriodoDeVentas, cadaCuanto?: number) {
  const hoy = useHoy()
  const desde = moverDia(hoy, -(dias - 1))
  return useQuery({
    queryKey: [...claves.ventas, 'periodo', hoy, dias],
    refetchInterval: cadaCuanto,
    queryFn: async ({ signal }): Promise<VentasPorPeriodo> => {
      const ventas = []
      for (let pagina = 1; ; pagina++) {
        const respuesta = await listarVentas(
          { date_from: desde, date_to: hoy, voided: false, page_size: POR_PAGINA, page: pagina },
          signal,
        )
        ventas.push(...respuesta.results)
        if (!respuesta.next || respuesta.results.length === 0) break
      }

      const porDia: DiaDeVentas[] = Array.from({ length: dias }, (_, i) => {
        const fecha = moverDia(desde, i)
        return {
          fecha,
          etiqueta: etiquetaCortaDeDia(fecha, { hoy, conMes: dias === 30 }),
          etiquetaLarga: formatearDia(fecha),
          total: 0,
          cantidad: 0,
          esHoy: fecha === hoy,
        }
      })
      const indicePorFecha = new Map(porDia.map((fila, indice) => [fila.fecha, indice]))

      for (const venta of ventas) {
        const fecha = diaEnColombia(venta.created_at)
        const indice = fecha ? indicePorFecha.get(fecha) : undefined
        if (indice !== undefined) {
          porDia[indice].total += venta.total
          porDia[indice].cantidad += 1
        }
      }

      const total = ventas.reduce((suma, venta) => suma + venta.total, 0)
      const mejorDia = porDia.reduce<DiaDeVentas | null>(
        (mejor, actual) => (actual.total > (mejor?.total ?? 0) ? actual : mejor),
        null,
      )

      return {
        dias,
        desde,
        hasta: hoy,
        total,
        cantidad: ventas.length,
        promedioDiario: Math.round(total / dias),
        mejorDia,
        porDia,
      }
    },
  })
}
