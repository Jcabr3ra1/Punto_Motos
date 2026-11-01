import { desglosarError } from '../api/errors'

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p role="status" className="texto-suave">
      {texto}
    </p>
  )
}

/** Cuando no se pudo cargar una pantalla: explica qué pasó y permite reintentar. */
export function ErrorDeCarga({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const { generales } = desglosarError(error)
  return (
    <div role="alert" className="aviso aviso--error">
      {generales.map((mensaje) => (
        <p key={mensaje}>{mensaje}</p>
      ))}
      <button type="button" className="boton boton--secundario boton--auto" onClick={onReintentar}>
        Reintentar
      </button>
    </div>
  )
}
