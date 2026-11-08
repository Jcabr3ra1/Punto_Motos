import { useQuery } from '@tanstack/react-query'
import { claves } from '../api/consultas'
import type { Paginated } from '../api/types'
import { listarDevoluciones, listarVentas } from '../api/ventas'
import {
  diaEnColombia,
  etiquetaCortaDeDia,
  formatearDia,
  inicioDeMes,
  intervaloMesAnteriorComparable,
  moverDia,
} from '../utilidades/fechas'
import type { DiaDeVentas } from './useVentasPorPeriodo'

const POR_PAGINA = 200
const CINCO_MINUTOS = 5 * 60_000

export interface ResumenDeTramo {
  desde: string
  hasta: string
  total: number
  cantidad: number
  serie: DiaDeVentas[]
  mejorDia: DiaDeVentas | null
}

export interface DatosDePanoramaDeVentas {
  hoy: { fecha: string; total: number; cantidad: number }
  ayer: { fecha: string; total: number; cantidad: number }
  sieteDias: ResumenDeTramo
  mes: ResumenDeTramo
}

async function recorrerPaginas<T>(pedir: (pagina: number) => Promise<Paginated<T>>): Promise<T[]> {
  const acumulado: T[] = []
  for (let pagina = 1; ; pagina++) {
    const respuesta = await pedir(pagina)
    acumulado.push(...respuesta.results)
    if (!respuesta.next || respuesta.results.length === 0) break
  }
  return acumulado
}

function construirTramo(
  desde: string,
  hasta: string,
  hoy: string,
  conMes: boolean,
  totalesPorDia: Map<string, { total: number; cantidad: number }>,
): ResumenDeTramo {
  const serie: DiaDeVentas[] = []
  let total = 0
  let cantidad = 0

  for (let fecha = desde; fecha <= hasta; fecha = moverDia(fecha, 1)) {
    const acumulado = totalesPorDia.get(fecha) ?? { total: 0, cantidad: 0 }
    total += acumulado.total
    cantidad += acumulado.cantidad
    serie.push({
      fecha,
      etiqueta: etiquetaCortaDeDia(fecha, { hoy, conMes }),
      etiquetaLarga: formatearDia(fecha),
      total: acumulado.total,
      cantidad: acumulado.cantidad,
      esHoy: fecha === hoy,
    })
  }

  const mejorDia = serie.reduce<DiaDeVentas | null>(
    (mejor, actual) => (actual.total > (mejor?.total ?? 0) ? actual : mejor),
    null,
  )

  return { desde, hasta, total, cantidad, serie, mejorDia }
}

/**
 * Panorama compartido de ventas vigentes para Inicio del dueño:
 * - Un único recorrido paginado cubre hoy, ayer, últimos 7 días y mes en curso.
 * - La referencia comparable del mes anterior corre en consulta separada para que un fallo suyo no afecte el mes actual.
 * Ambas cuelgan de `claves.ventas`, por lo que cualquier venta nueva o anulación las invalida.
 */
export function usePanoramaDeVentas(hoy: string, cadaCuanto?: number) {
  const inicioMes = inicioDeMes(hoy)
  const inicio7Dias = moverDia(hoy, -6)
  const ayerFecha = moverDia(hoy, -1)
  const desdeActual = inicioMes < inicio7Dias ? inicioMes : inicio7Dias
  const intervaloMesAnterior = intervaloMesAnteriorComparable(hoy)

  const actual = useQuery({
    queryKey: [...claves.ventas, 'panorama-actual', hoy],
    refetchInterval: cadaCuanto,
    queryFn: async ({ signal }): Promise<DatosDePanoramaDeVentas> => {
      const ventas = await recorrerPaginas((pagina) =>
        listarVentas(
          { date_from: desdeActual, date_to: hoy, voided: false, page_size: POR_PAGINA, page: pagina },
          signal,
        ),
      )

      const totalesPorDia = new Map<string, { total: number; cantidad: number }>()
      for (const venta of ventas) {
        const fecha = diaEnColombia(venta.created_at)
        if (!fecha || fecha < desdeActual || fecha > hoy) continue
        const previo = totalesPorDia.get(fecha) ?? { total: 0, cantidad: 0 }
        totalesPorDia.set(fecha, { total: previo.total + venta.total, cantidad: previo.cantidad + 1 })
      }

      const resumenHoy = totalesPorDia.get(hoy) ?? { total: 0, cantidad: 0 }
      const resumenAyer = totalesPorDia.get(ayerFecha) ?? { total: 0, cantidad: 0 }

      return {
        hoy: { fecha: hoy, total: resumenHoy.total, cantidad: resumenHoy.cantidad },
        ayer: { fecha: ayerFecha, total: resumenAyer.total, cantidad: resumenAyer.cantidad },
        sieteDias: construirTramo(inicio7Dias, hoy, hoy, false, totalesPorDia),
        mes: construirTramo(inicioMes, hoy, hoy, true, totalesPorDia),
      }
    },
  })

  const mesAnterior = useQuery({
    queryKey: [...claves.ventas, 'panorama-mes-anterior', intervaloMesAnterior.desde, intervaloMesAnterior.hasta],
    staleTime: CINCO_MINUTOS,
    queryFn: async ({ signal }) => {
      const ventas = await recorrerPaginas((pagina) =>
        listarVentas(
          {
            date_from: intervaloMesAnterior.desde,
            date_to: intervaloMesAnterior.hasta,
            voided: false,
            page_size: POR_PAGINA,
            page: pagina,
          },
          signal,
        ),
      )
      return {
        desde: intervaloMesAnterior.desde,
        hasta: intervaloMesAnterior.hasta,
        total: ventas.reduce((suma, venta) => suma + venta.total, 0),
        cantidad: ventas.length,
      }
    },
  })

  return { actual, mesAnterior, intervaloMesAnterior }
}

/** Recorre todas las páginas de devoluciones registradas hoy para sumar `SaleReturn.total` sin truncar en 200. */
export function useDevolucionesDeHoy(hoy: string, cadaCuanto?: number) {
  return useQuery({
    queryKey: [...claves.devoluciones, 'panorama-hoy', hoy],
    refetchInterval: cadaCuanto,
    queryFn: async ({ signal }) => {
      const devoluciones = await recorrerPaginas((pagina) =>
        listarDevoluciones({ date_from: hoy, date_to: hoy, page_size: POR_PAGINA, page: pagina }, signal),
      )
      return {
        total: devoluciones.reduce((suma, item) => suma + item.total, 0),
        cantidad: devoluciones.length,
      }
    },
  })
}
