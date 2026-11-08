import type { ReactNode } from 'react'

export interface Indicador {
  rotulo: string
  valor: ReactNode
  /** Pide atención (filete naranja), por ejemplo lo que hay que reponer. */
  alerta?: boolean
  cargando?: boolean
  error?: boolean
}

/** Lo más importante de la pantalla, de un vistazo: de 2 a 4 cifras exactas unidas por una línea fina. */
export function FranjaDeIndicadores({ indicadores }: { indicadores: readonly Indicador[] }) {
  return (
    <section aria-label="Indicadores">
      <dl className="indicadores" style={{ '--indicadores': indicadores.length } as React.CSSProperties}>
        {indicadores.map(({ rotulo, valor, alerta, cargando, error }) => (
          <div key={rotulo} className={`indicador${alerta ? ' indicador--alerta' : ''}`}>
            <dt className="indicador__rotulo">{rotulo}</dt>
            <dd className="indicador__valor" aria-busy={cargando || undefined}>
              {cargando ? (
                <span className="esqueleto indicador__esqueleto" />
              ) : error ? (
                <span title="No se pudo cargar">—</span>
              ) : (
                valor
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
