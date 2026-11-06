import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { mecanico, paginaDe, producto, tipoDeServicio, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const aceite = tipoDeServicio()
const otro = tipoDeServicio({ id: 2, code: 999, name: 'Otro', suggested_price: 0 })
const carlos = mecanico()
const pastillas = producto({ id: 1, sale_price: 25000, stock: 3 })

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(usuario: User = vendedor, rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true } }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: 'x', finished_by: 'dueno', products_counted: 1, units_counted: 1 } }),
    'GET /service-types': () => ({ cuerpo: [aceite, otro] }),
    'GET /mechanics': () => ({ cuerpo: [{ id: 1, name: 'Carlos Ruiz', phone: '', is_active: true }] }),
    'GET /catalog/search*': () => ({ cuerpo: [pastillas] }),
    'GET /customers*': () => ({ cuerpo: paginaDe([{ id: 18, name: 'Ana Gómez', phone: '3001234567', notes: '', is_active: true }]) }),
    ...rutas,
  })
  mostrarRutas(usuario, '/venta/vender')
  return { api, u: userEvent.setup() }
}

async function elegirAna(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByRole('combobox', { name: 'Cliente' }), 'ana')
  await u.click(await screen.findByRole('option', { name: /Ana Gómez/ }))
}

const ventas = (api: { llamadas: { clave: string; cuerpo: unknown }[] }) =>
  api.llamadas.filter((l) => l.clave === 'POST /sales').map((l) => l.cuerpo as Record<string, unknown>)

describe('servicios en la venta', () => {
  it('escribir el código del servicio y Enter lo agrega; sin mecánico no se cobra', async () => {
    const { u } = abrir()
    const buscador = await screen.findByRole('combobox', { name: 'Buscar producto o servicio' })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Elige un servicio' })).toBeInTheDocument())

    await u.type(buscador, '10')
    expect(await screen.findByRole('option', { name: /Servicio: Cambio de aceite/, selected: true })).toBeInTheDocument()
    await u.keyboard('{Enter}')

    const fila = screen.getByRole('row', { name: /Cambio de aceite/ })
    expect(fila).toHaveTextContent(/\$\s?15\.000/)
    // La vendedora no cambia la mano de obra.
    expect(within(fila).queryByLabelText(/^Mano de obra de/)).not.toBeInTheDocument()
    await elegirAna(u)
    expect(screen.getByRole('button', { name: /^Cobrar/ })).toBeDisabled()
    expect(screen.getByText('Elige el mecánico de cada servicio para cobrar.')).toBeInTheDocument()
  })

  it('cobra una venta solo de servicios con mecánico y placa, sin enviar items', async () => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta({ items: [], total: 15000 }) }) })
    await screen.findByRole('option', { name: '101 · Cambio de aceite' })
    await u.selectOptions(screen.getByLabelText('Agregar servicio'), '1')
    await u.selectOptions(screen.getByLabelText('Mecánico de Cambio de aceite (1)'), 'Carlos Ruiz')
    await u.type(screen.getByLabelText('Placa de Cambio de aceite (1)'), 'abc-12d')
    await elegirAna(u)
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent(/\$\s?15\.000/)

    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await screen.findByRole('heading', { name: 'Venta registrada' })
    const enviada = ventas(api)[0]
    expect(enviada.services).toEqual([{ service_type: 1, mechanic: 1, plate: 'abc-12d' }])
    expect(enviada).not.toHaveProperty('items')
    expect(enviada.payments).toEqual([{ method: 'cash', amount: 15000 }])
  })

  it('suma la mano de obra a los productos y el dueño puede cambiarla', async () => {
    const { api, u } = abrir(dueno, {
      'GET /mechanics': () => ({ cuerpo: [carlos] }),
      'POST /sales': () => ({ estado: 201, cuerpo: venta() }),
    })
    await screen.findByRole('option', { name: '101 · Cambio de aceite' })
    await u.selectOptions(screen.getByLabelText('Agregar servicio'), '1')
    await u.type(screen.getByRole('combobox', { name: 'Buscar producto o servicio' }), 'pas')
    await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(true))
    await u.keyboard('{Enter}')
    await u.selectOptions(screen.getByLabelText('Mecánico de Cambio de aceite (1)'), 'Carlos Ruiz')
    const manoDeObra = screen.getByLabelText('Mano de obra de Cambio de aceite (1)')
    await u.clear(manoDeObra)
    await u.type(manoDeObra, '20000')
    await elegirAna(u)
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent(/\$\s?45\.000/)

    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(ventas(api)[0]).toMatchObject({
      items: [{ product: 1, quantity: 1 }],
      services: [{ service_type: 1, mechanic: 1, labor_price: 20000 }],
      payments: [{ method: 'cash', amount: 45000 }],
    })
  })

  it('el mismo servicio se puede agregar dos veces y el error de una línea sale junto a ella', async () => {
    const { u } = abrir(vendedor, {
      'POST /sales': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          services: [{}, { details: ['Escribe qué se hizo en el servicio «Otro».'] }],
        }),
    })
    await screen.findByRole('option', { name: '101 · Cambio de aceite' })
    await u.selectOptions(screen.getByLabelText('Agregar servicio'), '1')
    await u.selectOptions(screen.getByLabelText('Agregar servicio'), '2')
    expect(screen.getByLabelText('Qué se hizo en Otro (2)')).toHaveAttribute('placeholder', 'Opcional')
    await u.selectOptions(screen.getByLabelText('Mecánico de Cambio de aceite (1)'), 'Carlos Ruiz')
    await u.selectOptions(screen.getByLabelText('Mecánico de Otro (2)'), 'Carlos Ruiz')
    await elegirAna(u)
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    const fila = screen.getByRole('row', { name: /Otro/ })
    expect(await within(fila).findByText('Escribe qué se hizo en el servicio «Otro».')).toBeInTheDocument()
  })

  it('el recibo muestra el servicio con su mecánico y la placa', async () => {
    simularApi({
      'GET /sales/41': () => ({
        cuerpo: venta({
          services: [
            {
              id: 9,
              service_type: { id: 1, code: 101, name: 'Cambio de aceite' },
              mechanic: { id: 1, name: 'Carlos Ruiz' },
              plate: 'ABC12D',
              details: '',
              suggested_price: 15000,
              labor_price: 15000,
              price_changed: false,
            },
          ],
        }),
      }),
    })
    mostrarRutas(vendedor, '/venta/historial/41')

    const recibo = await screen.findByRole('article', { name: 'Recibo n.º 41' })
    expect(recibo).toHaveTextContent('101 · Cambio de aceite')
    expect(recibo).toHaveTextContent('Mecánico: Carlos Ruiz · Placa ABC12D')
  })

  it('el historial filtra por mecánico', async () => {
    const api = simularApi({
      'GET /sales*': () => ({ cuerpo: paginaDe([{ ...venta(), services_count: 2 }]) }),
      'GET /mechanics*': () => ({ cuerpo: [carlos] }),
    })
    mostrarRutas(dueno, '/venta/historial')
    const u = userEvent.setup()

    expect(await screen.findByText('2 servicios')).toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Mecánico'), 'Carlos Ruiz')

    await waitFor(() => expect(api.llamadas.some((l) => l.clave === 'GET /sales?mechanic=1')).toBe(true))
  })
})
