import { describe, expect, it } from 'vitest'
import { desglosarError } from './errors'

describe('desglosarError', () => {
  it('separa los errores por campo de los generales', () => {
    const resultado = desglosarError({
      code: 'validation_error',
      message: 'Revisa los datos marcados.',
      fields: { username: ['Ya existe.'], non_field_errors: ['Debe quedar al menos un dueño activo.'] },
    })

    expect(resultado).toEqual({
      generales: ['Debe quedar al menos un dueño activo.'],
      campos: { username: ['Ya existe.'] },
    })
  })

  it('no repite el mensaje general cuando ya hay errores por campo', () => {
    const resultado = desglosarError({
      code: 'validation_error',
      message: 'Revisa los datos marcados.',
      fields: { name: ['Obligatorio.'] },
    })

    expect(resultado.generales).toEqual([])
  })

  it('usa el mensaje cuando el error no es de validación', () => {
    expect(
      desglosarError({ code: 'throttled', message: 'Espera un momento.', fields: {} }).generales,
    ).toEqual(['Espera un momento.'])
  })

  it('usa el mensaje si es de validación pero no trae detalle', () => {
    expect(
      desglosarError({ code: 'validation_error', message: 'Datos inválidos.', fields: {} }).generales,
    ).toEqual(['Datos inválidos.'])
  })

  it('devuelve un mensaje genérico si el error no viene de la API', () => {
    expect(desglosarError(new Error('x')).generales).toEqual([
      'Ocurrió un error inesperado. Intenta de nuevo.',
    ])
  })
})
