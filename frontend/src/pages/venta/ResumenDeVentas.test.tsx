import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaleSummary } from '../../api/types'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { mostrarRutas } from '../../test/mostrar'
import { exportarExcel } from '../../utilidades/excel'
import { exportarRecuentoMensual } from '../../utilidades/excelMensual'
import { hoyEnColombia, moverDia } from '../../utilidades/fechas'

vi.mock('../../utilidades/excel', async (importActual) => {
  const real = await importActual<typeof import('../../utilidades/excel')>()
  return { ...real, exportarExcel: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('../../utilidades/excelMensual', async (importActual) => {
  const real = await importActual<typeof import('../../utilidades/excelMensual')>()
  return { ...real, exportarRecuentoMensual: vi.fn().mockResolvedValue(undefined) }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const resumenEjemplo: SaleSummary = {
  date_from: '2026-11-13',
  date_to: '2026-11-13',
  totals: {
    products_quantity: 12,
    products_total: 660000,
    services_count: 20,
    services_total: 200000,
    grand_total: 860000,
  },
  categories: [
    { id: 1, name: 'Neumáticos', quantity: 10, total: 600000 },
    { id: 2, name: 'Aceites', quantity: 2, total: 60000 },
  ],
  services: [{ id: 5, name: 'Deshinchada', count: 20, total: 200000 }],
  products: [
    {
      id: 10,
      code: 'NEU-UNI-001',
      name: 'Neumático 90/90-18',
      category_id: 1,
      category_name: 'Neumáticos',
      quantity: 10,
      total: 600000,
    },
    {
      id: 11,
      code: 'ACE-UNI-001',
      name: 'Aceite 20W50',
      category_id: 2,
      category_name: 'Aceites',
      quantity: 2,
      total: 60000,
    },
  ],
}

describe('resumen de ventas', () => {
  it('solo permite el acceso al dueño', async () => {
    simularApi({})
    mostrarRutas(vendedor, '/venta/resumen')
    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument()
  })

  it('muestra totales, tipos, servicios y productos y filtra al elegir un tipo o buscar', async () => {
    simularApi({ 'GET /sales/summary*': () => ({ cuerpo: resumenEjemplo }) })
    mostrarRutas(dueno, '/venta/resumen')
    const u = userEvent.setup()

    expect(await screen.findByText('$ 860.000')).toBeInTheDocument()
    const tablaTipos = screen.getByRole('table', { name: 'Ventas por tipo de producto' })
    expect(within(tablaTipos).getByText('Neumáticos')).toBeInTheDocument()
    expect(within(tablaTipos).getByText('10')).toBeInTheDocument()

    const tablaServicios = screen.getByRole('table', { name: 'Ventas por servicio' })
    expect(within(tablaServicios).getByText('Deshinchada')).toBeInTheDocument()
    expect(within(tablaServicios).getByText('20')).toBeInTheDocument()

    // Clic en "Aceites" filtra la tabla de productos
    await u.click(within(tablaTipos).getByText('Aceites'))
    const tablaProductos = screen.getByRole('table', { name: 'Ventas por producto' })
    expect(within(tablaProductos).getByText('Aceite 20W50')).toBeInTheDocument()
    expect(within(tablaProductos).queryByText('Neumático 90/90-18')).not.toBeInTheDocument()

    // Clic otra vez quita el filtro y el buscador filtra por código
    await u.click(within(tablaTipos).getByText('Aceites'))
    expect(within(tablaProductos).getByText('Neumático 90/90-18')).toBeInTheDocument()
    await u.type(screen.getByRole('searchbox', { name: 'Buscar producto' }), 'NEU')
    expect(within(tablaProductos).queryByText('Aceite 20W50')).not.toBeInTheDocument()
  })

  it('cambia el rango de fechas al elegir Últimos 7 días', async () => {
    const api = simularApi({ 'GET /sales/summary*': () => ({ cuerpo: resumenEjemplo }) })
    mostrarRutas(dueno, '/venta/resumen')
    const u = userEvent.setup()

    await screen.findByText('$ 860.000')
    await u.click(screen.getByRole('button', { name: '7 días' }))

    const hoy = hoyEnColombia()
    const hace6 = moverDia(hoy, -6)
    expect(api.llamadas.some((l) => l.clave.includes(`date_from=${hace6}`) && l.clave.includes(`date_to=${hoy}`))).toBe(true)
  })

  it('exporta a Excel al pulsar Exportar Excel', async () => {
    simularApi({ 'GET /sales/summary*': () => ({ cuerpo: resumenEjemplo }) })
    mostrarRutas(dueno, '/venta/resumen')
    const u = userEvent.setup()

    await screen.findByText('$ 860.000')
    await u.click(screen.getByRole('button', { name: 'Exportar Excel' }))

    await waitFor(() => expect(exportarExcel).toHaveBeenCalledTimes(1))
    expect(exportarExcel).toHaveBeenCalledWith(
      'resumen-ventas-2026-11-13',
      expect.arrayContaining([
        expect.objectContaining({ nombre: 'Resumen' }),
        expect.objectContaining({ nombre: 'Por tipo de producto' }),
        expect.objectContaining({ nombre: 'Por servicio' }),
        expect.objectContaining({ nombre: 'Por producto' }),
      ]),
    )
  })

  it('consulta el reporte mensual y genera el Excel diseñado al pulsar Descargar recuento (.xlsx)', async () => {
    const reporteMensual = {
      month: '2026-10',
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      business: { name: 'Punto Moto', tax_id: '900123456', address: 'Calle 1', phone: '3001234567' },
      sales: {
        count: 10,
        voided_count: 1,
        products_quantity: 12,
        products_total: 660000,
        services_count: 5,
        services_total: 200000,
        gross_total: 860000,
        returns_count: 1,
        returns_total: 40000,
        net_total: 820000,
        cash_total: 520000,
        transfer_total: 300000,
      },
      cash: {
        sessions_count: 20,
        expenses_total: 50000,
        owner_withdrawals_total: 100000,
        incoming_total: 820000,
        outgoing_total: 300000,
      },
      purchases: { received_count: 2, received_total: 350000, payments_total: 200000 },
      workshop: {
        settlements_count: 4,
        labor_total: 200000,
        mechanic_paid_total: 120000,
        deductions_total: 0,
        shop_share_total: 80000,
      },
      consignments: { deliveries_count: 1, reports_total: 90000, payments_total: 90000 },
      categories: resumenEjemplo.categories,
      services: resumenEjemplo.services,
      products: resumenEjemplo.products.map(({ id, code, name, category_name, quantity, total }) => ({
        id,
        code,
        name,
        category_name,
        quantity,
        total,
      })),
      daily: [{ date: '2026-10-15', sales_count: 3, gross_total: 300000, returns_total: 0, net_total: 300000 }],
      low_stock: [{ id: 9, code: 'ACE-MOT-001', name: 'Aceite 20W50', stock: 1, min_stock: 5 }],
    }
    const api = simularApi({
      'GET /sales/summary*': () => ({ cuerpo: resumenEjemplo }),
      'GET /reports/monthly*': () => ({ cuerpo: reporteMensual }),
    })
    mostrarRutas(dueno, '/venta/resumen')
    const u = userEvent.setup()

    const selectorMes = await screen.findByLabelText('Mes del recuento')
    await u.clear(selectorMes)
    await u.type(selectorMes, '2026-10')
    await u.click(screen.getByRole('button', { name: 'Descargar recuento (.xlsx)' }))

    await waitFor(() => expect(exportarRecuentoMensual).toHaveBeenCalledWith(reporteMensual))
    expect(api.llamadas.some((l) => l.clave === 'GET /reports/monthly?month=2026-10')).toBe(true)
  })
})
