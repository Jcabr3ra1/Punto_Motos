import { describe, expect, it } from 'vitest'
import { leerPeriodo, rangoDePeriodo } from './periodos'

describe('períodos de fechas', () => {
  it('Hoy, 7 días y Este mes se calculan desde el día de Colombia', () => {
    expect(rangoDePeriodo('hoy', '2026-11-08')).toEqual({ date_from: '2026-11-08', date_to: '2026-11-08' })
    expect(rangoDePeriodo('7dias', '2026-11-03')).toEqual({ date_from: '2026-10-28', date_to: '2026-11-03' })
    expect(rangoDePeriodo('mes', '2026-11-08')).toEqual({ date_from: '2026-11-01', date_to: '2026-11-08' })
  })

  it('Todas no lleva fechas y Fechas usa las elegidas', () => {
    expect(rangoDePeriodo('todas', '2026-11-08')).toEqual({})
    expect(rangoDePeriodo('fechas', '2026-11-08', { desde: '2026-10-01' })).toEqual({ date_from: '2026-10-01' })
    expect(rangoDePeriodo('fechas', '2026-11-08', { desde: '2026-10-01', hasta: '2026-10-15' })).toEqual({
      date_from: '2026-10-01',
      date_to: '2026-10-15',
    })
  })

  it('sin período en la URL es Hoy, pero una URL vieja con fechas es Fechas', () => {
    expect(leerPeriodo(new URLSearchParams(''))).toBe('hoy')
    expect(leerPeriodo(new URLSearchParams('periodo=mes'))).toBe('mes')
    expect(leerPeriodo(new URLSearchParams('periodo=otro'))).toBe('hoy')
    expect(leerPeriodo(new URLSearchParams('date_from=2026-11-03'))).toBe('fechas')
  })
})
