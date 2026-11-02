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

describe('desglosarError con errores anidados', () => {
  it('aplana los errores de un objeto anidado con puntos', () => {
    const resultado = desglosarError({
      code: 'validation_error',
      message: 'Revisa los datos marcados.',
      fields: { payment: { amount: ['Se deben $78.000: no se pueden abonar $999.999.'] } } as never,
    })

    expect(resultado).toEqual({
      generales: [],
      campos: { 'payment.amount': ['Se deben $78.000: no se pueden abonar $999.999.'] },
    })
  })

  it('aplana los errores de una lista por posición', () => {
    const resultado = desglosarError({
      code: 'validation_error',
      message: 'Revisa los datos marcados.',
      fields: { items: [{}, { quantity: ['Debe ser mayor que 0.'] }] } as never,
    })

    expect(resultado.campos).toEqual({ 'items.1.quantity': ['Debe ser mayor que 0.'] })
  })

  it('una lista de textos sigue siendo el error del propio campo', () => {
    const resultado = desglosarError({
      code: 'validation_error',
      message: 'Revisa los datos marcados.',
      fields: { items: ['FRE-PUL-PAS está repetido: deja una sola línea con la cantidad total.'] },
    })

    expect(resultado.campos).toEqual({ items: ['FRE-PUL-PAS está repetido: deja una sola línea con la cantidad total.'] })
  })
})
