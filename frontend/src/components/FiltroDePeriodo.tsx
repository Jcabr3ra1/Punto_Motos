import { PERIODOS, type Periodo } from '../utilidades/periodos'
import { BotonDeFiltro } from './BarraDeFiltros'

interface Props {
  periodo: Periodo
  /** Fechas elegidas a mano con «Fechas» (`AAAA-MM-DD` o vacío). */
  desde: string
  hasta: string
  onPeriodo: (periodo: Periodo) => void
  onDesde: (dia: string) => void
  onHasta: (dia: string) => void
}

/**
 * Los botones de período de una barra de filtros (Hoy, 7 días, Este mes, Todas las fechas y Fechas) y, con
 * «Fechas», los campos Desde y Hasta.
 */
export function FiltroDePeriodo({ periodo, desde, hasta, onPeriodo, onDesde, onHasta }: Props) {
  return (
    <>
      <div className="barra-de-filtros__grupo" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <BotonDeFiltro key={p.valor} activo={periodo === p.valor} onClick={() => onPeriodo(p.valor)}>
            {p.texto}
          </BotonDeFiltro>
        ))}
      </div>
      {periodo === 'fechas' && (
        <div className="barra-de-filtros__grupo">
          <label className="filtro-fecha">
            Desde
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => onDesde(e.target.value)} />
          </label>
          <label className="filtro-fecha">
            Hasta
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => onHasta(e.target.value)} />
          </label>
        </div>
      )}
    </>
  )
}
