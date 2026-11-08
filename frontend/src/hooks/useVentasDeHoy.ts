import { useQuery } from '@tanstack/react-query'
import { claves } from '../api/consultas'
import { listarVentas } from '../api/ventas'
import { useHoy } from './useHoy'

export interface VentasDeHoy {
  cantidad: number
  total: number
  /** Total vendido en cada hora del día, de 8 a. m. a 6 p. m. o más si hubo ventas fuera de ese horario. */
  porHora: { hora: number; total: number }[]
}

const POR_PAGINA = 200
const PRIMERA_HORA = 8
const ULTIMA_HORA = 18
const horaEnColombia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' })

/** Hora (0 a 23) de una venta en Colombia, o null si la fecha no se puede leer. */
function horaDe(iso: string): number | null {
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? null : Number(horaEnColombia.format(fecha))
}

/**
 * Las ventas de hoy sin anuladas: cuántas, por cuánto y por hora. Recorre todas las páginas para que la suma sea
 * exacta aunque haya más de 200 ventas.
 */
export function useVentasDeHoy(cadaCuanto?: number) {
  const hoy = useHoy()
  return useQuery({
    queryKey: [...claves.ventas, 'hoy', hoy],
    refetchInterval: cadaCuanto,
    queryFn: async ({ signal }): Promise<VentasDeHoy> => {
      const ventas = []
      for (let pagina = 1; ; pagina++) {
        const respuesta = await listarVentas({ date_from: hoy, date_to: hoy, voided: false, page_size: POR_PAGINA, page: pagina }, signal)
        ventas.push(...respuesta.results)
        if (!respuesta.next || respuesta.results.length === 0) break
      }
      const horas = ventas.map((venta) => horaDe(venta.created_at)).filter((hora): hora is number => hora !== null)
      const desde = Math.min(PRIMERA_HORA, ...horas)
      const hasta = Math.max(ULTIMA_HORA, ...horas)
      const porHora = Array.from({ length: hasta - desde + 1 }, (_, i) => ({ hora: desde + i, total: 0 }))
      ventas.forEach((venta) => {
        const hora = horaDe(venta.created_at)
        if (hora !== null) porHora[hora - desde].total += venta.total
      })
      return { cantidad: ventas.length, total: ventas.reduce((suma, venta) => suma + venta.total, 0), porHora }
    },
  })
}
