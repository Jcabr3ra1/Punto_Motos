import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { producto } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const pastillas = producto({ id: 1, stock: 5 })
const sinStock = producto({ id: 3, code: 'LL909018', name: 'Llanta 90/90 rin 18', stock: 0, is_low_stock: true })

const conteoCerrado = { is_open: false, finished_at: '2026-11-01T08:00:00-05:00', finished_by: 'dueno', products_counted: 10, units_counted: 50 }
const conteoAbierto = { is_open: true, finished_at: null, finished_by: null, products_counted: 3, units_counted: 12 }

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}, usuario = vendedor) {
  const api = simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: conteoCerrado }),
    'GET /catalog/search*': () => ({ cuerpo: [sinStock, pastillas] }),
    ...rutas,
  })
  mostrarRutas(usuario, '/venta')
  return { api, u: userEvent.setup(), buscador: await screen.findByRole('combobox', { name: 'Buscar producto' }) }
}

describe('aviso del inventario inicial', () => {
  it('avisa que no se debe vender mientras el conteo siga abierto', async () => {
    await abrir({ 'GET /inventory/initial-count': () => ({ cuerpo: conteoAbierto }) })

    expect(await screen.findByText(/inventario inicial todavía no ha terminado/)).toBeInTheDocument()
  })

  it('no avisa cuando el conteo ya terminó', async () => {
    const { api } = await abrir()

    await waitFor(() => expect(api.cuantas('GET /inventory/initial-count')).toBe(1))
    expect(screen.queryByText(/inventario inicial todavía no ha terminado/)).not.toBeInTheDocument()
  })
})

describe('consulta de precios y existencias', () => {
  it('explica que por ahora solo se consulta y empieza con el foco en el buscador', async () => {
    const { buscador } = await abrir()

    expect(screen.getByText(/Por ahora puedes consultar precios y existencias/)).toBeInTheDocument()
    expect(buscador).toHaveFocus()
  })

  it('muestra precio y existencias, con lo agotado marcado', async () => {
    const { u, buscador } = await abrir()

    await u.type(buscador, 'pas')

    const opcion = await screen.findByRole('option', { name: /FRE-PUL-PAS/ })
    expect(opcion).toHaveTextContent(/\$\s?25\.000/)
    expect(opcion).toHaveTextContent('Hay 5')
    expect(screen.getByRole('option', { name: /LL909018/ })).toHaveTextContent('Sin existencias')
  })

  it('no se puede elegir nada todavía: Enter y el clic no hacen nada', async () => {
    const { u, buscador } = await abrir()

    await u.type(buscador, 'pas')
    const opcion = await screen.findByRole('option', { name: /FRE-PUL-PAS/ })
    expect(opcion).not.toHaveAttribute('aria-selected')
    await u.keyboard('{Enter}')
    await u.click(opcion)

    expect(buscador).toHaveValue('pas')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('el dueño también consulta', async () => {
    const { u, buscador } = await abrir({}, dueno)

    await u.type(buscador, 'pas')

    expect(await screen.findByRole('option', { name: /FRE-PUL-PAS/ })).toBeInTheDocument()
  })
})
