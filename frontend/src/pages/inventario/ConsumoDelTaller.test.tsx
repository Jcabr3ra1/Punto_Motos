import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi } from '../../test/apiSimulada'
import { movimiento, pagina, paginaDeMovimientos, producto } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const grasa = producto({ id: 44, code: 'LUB-UNI-GRA', name: 'Grasa multiuso', stock: 3, is_workshop_supply: true })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /inventory/movements*': () => ({ cuerpo: paginaDeMovimientos([]) }),
    'GET /products*': () => ({ cuerpo: pagina([grasa]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/inventario/movimientos')
  const u = userEvent.setup()
  await u.click(await screen.findByRole('button', { name: 'Consumo del taller' }))
  return { api, u }
}

describe('consumo del taller', () => {
  it('solo ofrece insumos de taller y registra la salida', async () => {
    const { api, u } = await abrir({
      'POST /inventory/workshop-use': () => ({
        estado: 201,
        cuerpo: movimiento({ product: { id: 44, code: 'LUB-UNI-GRA', name: 'Grasa multiuso' }, kind: 'workshop_use', kind_label: 'Consumo del taller', quantity: -1, balance_after: 2 }),
      }),
    })

    await u.selectOptions(await screen.findByLabelText('Insumo'), '44')
    await u.type(screen.getByLabelText('Motivo'), 'Envase abierto para el taller')
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }))

    expect(await screen.findByText('Consumo registrado: «Grasa multiuso» ahora tiene 2 unidades.')).toBeInTheDocument()
    expect(api.llamadas.some((l) => l.clave.startsWith('GET /products') && l.clave.includes('workshop_supply=true'))).toBe(true)
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/workshop-use')?.cuerpo).toEqual({ product: 44, quantity: 1, reason: 'Envase abierto para el taller' })
  })

  it('muestra el error de cantidad junto al campo', async () => {
    const { u } = await abrir({
      'POST /inventory/workshop-use': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { quantity: ['Solo hay 3 unidades de LUB-UNI-GRA.'] }),
    })

    await u.selectOptions(await screen.findByLabelText('Insumo'), '44')
    await u.clear(screen.getByLabelText('Unidades que se sacan'))
    await u.type(screen.getByLabelText('Unidades que se sacan'), '9')
    await u.click(screen.getByRole('button', { name: 'Registrar consumo' }))

    expect(await screen.findByText('Solo hay 3 unidades de LUB-UNI-GRA.')).toBeInTheDocument()
  })

  it('explica qué hacer si no hay insumos marcados', async () => {
    await abrir({ 'GET /products*': () => ({ cuerpo: pagina([]) }) })

    expect(await screen.findByText(/No hay productos marcados como insumo de taller/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar consumo' })).toBeDisabled()
  })
})
