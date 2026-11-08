import { describe, expect, it } from 'vitest'
import {
  formatearDiaLargo,
  formatearIntervaloDeFechas,
  inicioDeMes,
  intervaloMesAnteriorComparable,
} from './fechas'
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

  it('calcula el intervalo comparable del mes anterior respetando febrero, meses de 30 días y cambio de año', () => {
    expect(inicioDeMes('2026-11-08')).toBe('2026-11-01')
    expect(inicioDeMes('2026-01-01')).toBe('2026-01-01')

    expect(intervaloMesAnteriorComparable('2026-11-08')).toEqual({ desde: '2026-10-01', hasta: '2026-10-08' })
    expect(intervaloMesAnteriorComparable('2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(intervaloMesAnteriorComparable('2028-03-31')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(intervaloMesAnteriorComparable('2026-05-31')).toEqual({ desde: '2026-04-01', hasta: '2026-04-30' })
    expect(intervaloMesAnteriorComparable('2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-15' })
    expect(intervaloMesAnteriorComparable('2026-01-01')).toEqual({ desde: '2025-12-01', hasta: '2025-12-01' })
  })

  it('formatea intervalos y días largos en español sin desfases horarios', () => {
    expect(formatearIntervaloDeFechas('2026-11-01', '2026-11-01', '2026-11-01')).toBe('1 de noviembre')
    expect(formatearIntervaloDeFechas('2025-12-01', '2025-12-01', '2026-01-01')).toBe('1 de diciembre de 2025')
    expect(formatearIntervaloDeFechas('2026-11-01', '2026-11-08', '2026-11-08')).toBe('Del 1 al 8 de noviembre')
    expect(formatearIntervaloDeFechas('2026-02-01', '2026-02-28', '2026-03-31')).toBe('Del 1 al 28 de febrero')
    expect(formatearIntervaloDeFechas('2026-10-28', '2026-11-03', '2026-11-03')).toBe('Del 28 de octubre al 3 de noviembre')
    expect(formatearIntervaloDeFechas('2025-12-01', '2025-12-15', '2026-01-15')).toBe('Del 1 al 15 de diciembre de 2025')
    expect(formatearIntervaloDeFechas('2025-12-28', '2026-01-03', '2026-01-03')).toBe(
      'Del 28 de diciembre de 2025 al 3 de enero de 2026',
    )
    expect(formatearDiaLargo('2026-11-08')).toBe('Domingo 8 de noviembre de 2026')
  })
})
