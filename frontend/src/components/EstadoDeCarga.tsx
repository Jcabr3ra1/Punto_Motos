import { LoaderCircle, RotateCw } from 'lucide-react'
import { desglosarError } from '../api/errors'

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p role="status" className="texto-suave cargando">
      <LoaderCircle className="cargando__icono" aria-hidden="true" size={16} />
      {texto}
    </p>
  )
}

/** Cuando no se pudo cargar una pantalla: explica qué pasó y permite reintentar. */
export function ErrorDeCarga({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const { generales, campos } = desglosarError(error)
  // Un filtro inválido llega como error de campo (por ejemplo, una fecha mal escrita): también se muestra.
  const mensajes = [...generales, ...Object.values(campos).flat()]
  return (
    <div role="alert" className="aviso aviso--error">
      {mensajes.map((mensaje) => (
        <p key={mensaje}>{mensaje}</p>
      ))}
      <button type="button" className="boton boton--secundario boton--auto" onClick={onReintentar}>
        <RotateCw aria-hidden="true" size={14} />
        Reintentar
      </button>
    </div>
  )
}
