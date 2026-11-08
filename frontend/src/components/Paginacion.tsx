interface Props {
  pagina: number
  /** Total de registros con los filtros aplicados (`count` de la API). */
  total: number
  /** Registros por página; la API usa 50 por defecto. */
  tamano?: number
  haySiguiente: boolean
  hayAnterior: boolean
  onCambiar: (pagina: number) => void
  etiqueta: string
  /** Para mantener el pie de una tabla aunque todavía no tenga otra página. */
  mostrarSiempre?: boolean
  textoAnterior?: string
}

/** Anterior / Siguiente para los listados paginados. Por defecto se oculta si todo cabe en una sola página. */
export function Paginacion({ pagina, total, tamano = 50, haySiguiente, hayAnterior, onCambiar, etiqueta, mostrarSiempre = false, textoAnterior = 'Anterior' }: Props) {
  const totalDePaginas = Math.max(1, Math.ceil(total / tamano))
  if (totalDePaginas <= 1 && !mostrarSiempre) return null
  return (
    <nav aria-label={etiqueta} className="paginacion">
      <button
        type="button"
        className="boton boton--secundario boton--auto"
        disabled={!hayAnterior}
        onClick={() => onCambiar(pagina - 1)}
      >
        {textoAnterior}
      </button>
      <span>
        Página {pagina} de {totalDePaginas}
      </span>
      <button
        type="button"
        className="boton boton--secundario boton--auto"
        disabled={!haySiguiente}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </nav>
  )
}
