import { isApiError } from './client'

export interface ErrorDeFormulario {
  /** Mensajes para mostrar arriba del formulario. */
  generales: string[]
  /**
   * Mensajes por campo, con el nombre del campo de la API. Los errores anidados se aplanan con
   * puntos: `{ payment: { amount: [...] } }` queda como `payment.amount` y los de una lista como
   * `items.1.quantity`.
   */
  campos: Record<string, string[]>
}

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intenta de nuevo.'

/** Convierte los errores de campo, que pueden venir anidados, en una lista plana por ruta. */
function aplanar(valor: unknown, ruta: string, destino: Record<string, string[]>) {
  if (typeof valor === 'string') {
    ;(destino[ruta] ??= []).push(valor)
  } else if (Array.isArray(valor)) {
    valor.forEach((elemento, indice) =>
      typeof elemento === 'string' ? aplanar(elemento, ruta, destino) : aplanar(elemento, `${ruta}.${indice}`, destino),
    )
  } else if (valor && typeof valor === 'object') {
    for (const [clave, interno] of Object.entries(valor)) {
      // Un `non_field_errors` anidado pertenece al objeto que lo contiene.
      aplanar(interno, clave === 'non_field_errors' ? ruta : ruta ? `${ruta}.${clave}` : clave, destino)
    }
  }
}

/**
 * Separa un error de la API en lo que va junto a cada campo y lo que va arriba del formulario
 * (`non_field_errors` y cualquier error que no sea de validación, como `throttled`).
 */
export function desglosarError(error: unknown): ErrorDeFormulario {
  if (!isApiError(error)) return { generales: [MENSAJE_INESPERADO], campos: {} }

  const planos: Record<string, string[]> = {}
  aplanar(error.fields ?? {}, '', planos)
  const { '': sinCampo = [], ...campos } = planos
  const generales = [...sinCampo]
  const hayCampos = Object.keys(campos).length > 0

  if (error.code !== 'validation_error' || (!hayCampos && generales.length === 0)) {
    generales.push(error.message)
  }
  return { generales, campos }
}
