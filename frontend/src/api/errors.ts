import { isApiError } from './client'

export interface ErrorDeFormulario {
  /** Mensajes para mostrar arriba del formulario. */
  generales: string[]
  /** Mensajes por campo, con el nombre del campo de la API. */
  campos: Record<string, string[]>
}

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

/**
 * Separa un error de la API en lo que va junto a cada campo y lo que va arriba del formulario
 * (`non_field_errors` y cualquier error que no sea de validación, como `throttled`).
 */
export function desglosarError(error: unknown): ErrorDeFormulario {
  if (!isApiError(error)) return { generales: [MENSAJE_INESPERADO], campos: {} }

  const { non_field_errors: sinCampo = [], ...campos } = error.fields ?? {}
  const generales = [...sinCampo]
  const hayCampos = Object.keys(campos).length > 0

  if (error.code !== 'validation_error' || (!hayCampos && generales.length === 0)) {
    generales.push(error.message)
  }
  return { generales, campos }
}
