import { useQuery } from '@tanstack/react-query'
import { listarLocales } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { ListaDeFiltro } from '../../components/BarraDeFiltros'

/** «Local: Todos ▾» en la barra, con los desactivados, que también tienen historial. */
export function FiltroDeLocal({ valor, onCambiar }: { valor?: number; onCambiar: (local: string | undefined) => void }) {
  const locales = useQuery({
    queryKey: [...claves.consignacion, 'locales', { include_inactive: true }],
    queryFn: ({ signal }) => listarLocales({ include_inactive: true }, signal),
  })
  return (
    <ListaDeFiltro etiqueta="Local" valor={valor ? String(valor) : ''} onCambiar={(v) => onCambiar(v || undefined)}>
      <option value="">Todos</option>
      {(locales.data ?? []).map((l) => (
        <option key={l.id} value={String(l.id)}>
          {l.name}
          {l.is_active ? '' : ' (desactivado)'}
        </option>
      ))}
    </ListaDeFiltro>
  )
}
