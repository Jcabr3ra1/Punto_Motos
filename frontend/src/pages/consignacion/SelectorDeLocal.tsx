import { useQuery } from '@tanstack/react-query'
import { listarLocales } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { CampoSelector } from '../../components/CampoSelector'
import { formatearPesos } from '../../utilidades/dinero'

/** Desplegable de locales. Con `conSaldo`, cada opción muestra lo que debe. */
export function SelectorDeLocal({
  valor,
  onCambiar,
  errores,
  etiqueta = 'Local',
  conSaldo = false,
  incluirInactivos = false,
}: {
  valor: string
  onCambiar: (valor: string) => void
  errores?: string[]
  etiqueta?: string
  conSaldo?: boolean
  incluirInactivos?: boolean
}) {
  const locales = useQuery({
    queryKey: [...claves.consignacion, 'locales', { include_inactive: incluirInactivos }],
    queryFn: ({ signal }) => listarLocales({ include_inactive: incluirInactivos }, signal),
  })
  return (
    <CampoSelector
      etiqueta={etiqueta}
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      opciones={[
        { valor: '', texto: locales.isPending ? 'Cargando…' : 'Elige un local' },
        ...(locales.data ?? []).map((l) => ({
          valor: String(l.id),
          texto: `${l.name}${conSaldo ? ` · debe ${formatearPesos(l.balance_due)}` : ''}${l.is_active ? '' : ' (desactivado)'}`,
        })),
      ]}
      errores={errores}
      required
    />
  )
}
