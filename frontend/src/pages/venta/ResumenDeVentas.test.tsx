import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaleSummary } from '../../api/types'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { mostrarRutas } from '../../test/mostrar'
import { hoyEnColombia, moverDia } from '../../utilidades/fechas'

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
})
