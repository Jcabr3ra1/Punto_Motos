import writeXlsxFile from 'write-excel-file/browser'
import { describe, expect, it } from 'vitest'
import type { MonthlyReport } from '../api/types'
import { construirHojasMensuales, tituloMes } from './excelMensual'

const REPORTE_EJEMPLO: MonthlyReport = {
  month: '2026-11',
  date_from: '2026-11-01',
  date_to: '2026-11-30',
  business: {
    name: 'Punto Moto',
    tax_id: '900123456',
    address: 'Calle 10 # 5-20',
    phone: '3001234567',
  },
  sales: {
    count: 14,
    voided_count: 1,
    products_quantity: 28,
    products_total: 1_250_000,
    services_count: 9,
    services_total: 450_000,
    gross_total: 1_750_000,
    returns_count: 1,
    returns_total: 50_000,
    net_total: 1_700_000,
    cash_total: 1_100_000,
    transfer_total: 600_000,
  },
  cash: {
    sessions_count: 12,
    expenses_total: 85_000,
    owner_withdrawals_total: 300_000,
    incoming_total: 1_850_000,
    outgoing_total: 520_000,
  },
  purchases: {
    received_count: 3,
    received_total: 840_000,
    payments_total: 500_000,
  },
  workshop: {
    settlements_count: 6,
    labor_total: 450_000,
    mechanic_paid_total: 270_000,
    deductions_total: 0,
    shop_share_total: 180_000,
  },
  consignments: {
    deliveries_count: 2,
    reports_total: 160_000,
    payments_total: 150_000,
  },
  categories: [{ id: 1, name: 'Frenos', quantity: 20, total: 900_000 }],
  services: [{ id: 1, name: 'Cambio de pastillas', count: 9, total: 450_000 }],
  products: [
    { id: 1, code: 'FRE-PUL-001', name: 'Pastillas Pulsar', category_name: 'Frenos', quantity: 20, total: 900_000 },
  ],
  daily: [{ date: '2026-11-05', sales_count: 3, gross_total: 450_000, returns_total: 50_000, net_total: 400_000 }],
  low_stock: [
    { id: 1, code: 'FRE-PUL-001', name: 'Pastillas Pulsar', stock: 0, min_stock: 5 },
    { id: 2, code: 'ACE-UNI-002', name: 'Aceite 20W50', stock: 2, min_stock: 4 },
  ],
}

describe('excelMensual', () => {
  it('formatea el título del mes en español', () => {
    expect(tituloMes('2026-11')).toBe('Noviembre de 2026')
    expect(tituloMes('2026-01')).toBe('Enero de 2026')
  })

  it('arma las 5 hojas diseñadas con banners, formato de moneda y estados de inventario', () => {
    const hojas = construirHojasMensuales(REPORTE_EJEMPLO)
    expect(hojas.map((h) => h.sheet)).toEqual([
      'Resumen del mes',
      'Por día',
      'Tipos y servicios',
      'Productos vendidos',
      'Por reponer',
    ])
    expect(hojas[0].showGridLines).toBe(false)
    expect(hojas[1].stickyRowsCount).toBe(4)

    const resumen = hojas[0].data
    expect(resumen[0][0]).toMatchObject({
      value: 'PUNTO MOTO — RECUENTO MENSUAL (Noviembre de 2026)',
      columnSpan: 5,
      backgroundColor: '#141517',
    })

    const porReponer = hojas[4].data
    expect(porReponer[4][4]).toMatchObject({ value: 'Agotado', backgroundColor: '#FEE2E2' })
    expect(porReponer[5][4]).toMatchObject({ value: 'Stock bajo', backgroundColor: '#FEF3C7' })
  })

  it('genera un archivo .xlsx válido con write-excel-file sin errores de esquema', async () => {
    const hojas = construirHojasMensuales(REPORTE_EJEMPLO)
    const blob = await writeXlsxFile(hojas).toBlob()
    expect(blob.size).toBeGreaterThan(2000)
    const bytes = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
    // Los .xlsx son archivos ZIP y comienzan por 'PK'.
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
  })
})
