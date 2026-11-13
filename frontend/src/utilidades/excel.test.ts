import { describe, expect, it, vi } from 'vitest'

const toFileMock = vi.fn().mockResolvedValue(undefined)
const writeXlsxFileMock = vi.fn((_hojas: unknown) => ({ toFile: toFileMock }))

vi.mock('write-excel-file/browser', () => ({
  default: writeXlsxFileMock,
}))

describe('exportarExcel', () => {
  it('genera hojas con encabezados en negrita, tipos de celda y extensión .xlsx', async () => {
    const { exportarExcel } = await import('./excel')
    await exportarExcel('reporte-prueba', [
      {
        nombre: 'Resumen/Ventas:2026',
        encabezados: ['Producto', 'Unidades', 'Total', 'Activo'],
        filas: [['Neumático', 10, 600000, true]],
      },
    ])

    expect(writeXlsxFileMock).toHaveBeenCalledTimes(1)
    const hojas = writeXlsxFileMock.mock.calls[0]?.[0] as { sheet: string; data: unknown[][] }[]
    expect(hojas[0].sheet).toBe('Resumen Ventas 2026')
    expect(hojas[0].data[0]).toEqual([
      { type: String, value: 'Producto', fontWeight: 'bold', backgroundColor: '#f1f6c8' },
      { type: String, value: 'Unidades', fontWeight: 'bold', backgroundColor: '#f1f6c8' },
      { type: String, value: 'Total', fontWeight: 'bold', backgroundColor: '#f1f6c8' },
      { type: String, value: 'Activo', fontWeight: 'bold', backgroundColor: '#f1f6c8' },
    ])
    expect(hojas[0].data[1]).toEqual([
      { type: String, value: 'Neumático' },
      { type: Number, value: 10 },
      { type: Number, value: 600000 },
      { type: String, value: 'Sí' },
    ])
    expect(toFileMock).toHaveBeenCalledWith('reporte-prueba.xlsx')
  })
})
