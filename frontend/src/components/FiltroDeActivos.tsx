import type { FiltroDeActivos as Valor } from '../hooks/useListaLocal'
import { BotonDeFiltro } from './BarraDeFiltros'

const OPCIONES: readonly { valor: Valor; texto: string }[] = [
  { valor: 'todos', texto: 'Todos' },
  { valor: 'activos', texto: 'Activos' },
  { valor: 'inactivos', texto: 'Inactivos' },
]

/** Los botones Todos, Activos e Inactivos de una barra de filtros. */
export function FiltroDeActivos({ valor, onCambiar }: { valor: Valor; onCambiar: (valor: Valor) => void }) {
  return (
    <div className="barra-de-filtros__grupo" role="group" aria-label="Estado">
      {OPCIONES.map((o) => (
        <BotonDeFiltro key={o.valor} activo={valor === o.valor} onClick={() => onCambiar(o.valor)}>
          {o.texto}
        </BotonDeFiltro>
      ))}
    </div>
  )
}
