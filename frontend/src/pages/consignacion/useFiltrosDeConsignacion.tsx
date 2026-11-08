import { useRef } from 'react'
import { useSearchParams } from 'react-router'
import type { FiltrosDeConsignacion } from '../../api/consignacion'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useHoy } from '../../hooks/useHoy'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { FiltroDeLocal } from './FiltroDeLocal'

/** Entregas, reportes y pagos abren con todas las fechas, como antes: son pocos al día. */
const PERIODO_INICIAL: Periodo = 'todas'

/**
 * Filtros de las listas de consignación (entregas, reportes y pagos), guardados en la URL: período, local y página,
 * con las filas que caben en el libro.
 */
export function useFiltrosDeConsignacion() {
  const [params, setParams] = useSearchParams()
  const hoy = useHoy()
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const numero = (clave: string) => {
    const valor = Number(params.get(clave))
    return Number.isInteger(valor) && valor > 0 ? valor : undefined
  }
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  const filtros: FiltrosDeConsignacion = {
    consignee: numero('consignee'),
    ...rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined }),
    page: numero('page'),
    page_size: porPagina,
  }

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  return {
    lista,
    porPagina,
    filtros,
    hayFiltros: Boolean(filtros.consignee || periodo !== PERIODO_INICIAL),
    cambiarPagina: (pagina: number) => cambiar({ page: String(pagina) }),
    barra: (
      <>
        <FiltroDePeriodo
          periodo={periodo}
          desde={params.get('date_from') ?? ''}
          hasta={params.get('date_to') ?? ''}
          onPeriodo={(valor) =>
            cambiar({
              periodo: valor === PERIODO_INICIAL ? undefined : valor,
              ...(valor === 'fechas' ? {} : { date_from: undefined, date_to: undefined }),
            })
          }
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        <FiltroDeLocal valor={filtros.consignee} onCambiar={(local) => cambiar({ consignee: local })} />
      </>
    ),
  }
}
