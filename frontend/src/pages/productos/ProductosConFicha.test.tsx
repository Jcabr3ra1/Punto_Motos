import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { movimiento, pagina, paginaDeMovimientos, paraVendedor, producto } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

const PASTILLAS = producto({ stock: 2, min_stock: 8, is_low_stock: true, cost_price: 18000, sale_price: 25000, location: 'Estante B2' })
const BUJIA = producto({ id: 2, code: 'ELE-BUJ', name: 'Bujía CR7HSA', stock: 15, min_stock: 12, is_low_stock: false })

function abrir(usuario = dueno) {
  const deUsuario = (p: typeof PASTILLAS) => (usuario === dueno ? p : paraVendedor(p))
  const api = simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /catalog/categories*': () => ({ cuerpo: [] }),
    'GET /catalog/motos*': () => ({ cuerpo: [] }),
    'GET /products*': (_, ruta) => {
      const consulta = new URLSearchParams(String(ruta).split('?')[1])
      if (consulta.get('page_size') === '1') return { cuerpo: pagina([], { count: consulta.get('workshop_supply') ? 38 : 412 }) }
      return { cuerpo: pagina([deUsuario(PASTILLAS), deUsuario(BUJIA)]) }
    },
    'GET /inventory/movements*': () => ({
      cuerpo: paginaDeMovimientos([movimiento({ id: 9, kind: 'sale', kind_label: 'Venta', quantity: -1, balance_after: 2 })]),
    }),
  })
  mostrarRutas(usuario, '/inventario/productos')
  return api
}

describe('productos', () => {
  it('los indicadores muestran los productos activos y los insumos de taller', async () => {
    abrir()

    const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
    await waitFor(() => expect(within(indicadores).getAllByRole('definition').map((d) => d.textContent)).toEqual(['412', '38']))
    expect(within(indicadores).getAllByRole('term').map((t) => t.textContent)).toEqual(['Productos activos', 'Insumos de taller'])
  })

  it('la existencia baja se ve como un medidor en alerta', async () => {
    abrir()

    const fila = (await screen.findByText('Pastillas de freno Pulsar 180')).closest('tr')!
    expect(within(fila).getByText('2').closest('.medidor')).toHaveClass('medidor--alerta')
  })

  it('un clic en la fila abre la ficha con el costo, el margen y los últimos movimientos', async () => {
    const api = abrir()
    const u = userEvent.setup()

    await u.click(await screen.findByText('Pastillas de freno Pulsar 180'))

    const ficha = await screen.findByRole('complementary', { name: 'Pastillas de freno Pulsar 180' })
    expect(ficha).toHaveTextContent(/costo \$\s?18\.000 · margen 28\s?%/)
    expect(ficha).toHaveTextContent('Estante B2')
    await waitFor(() => expect(ficha).toHaveTextContent('Venta'))
    expect(api.llamadas.some((l) => l.clave === 'GET /inventory/movements?product=1&page_size=5')).toBe(true)
  })

  it('el vendedor no ve costo ni margen en la ficha', async () => {
    abrir(vendedor)
    const u = userEvent.setup()

    await u.click(await screen.findByText('Pastillas de freno Pulsar 180'))

    const ficha = await screen.findByRole('complementary', { name: 'Pastillas de freno Pulsar 180' })
    expect(ficha).not.toHaveTextContent(/costo|margen/i)
    expect(within(ficha).queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('las flechas recorren los productos y Esc cierra la ficha', async () => {
    abrir()
    const u = userEvent.setup()
    const contenedor = (await screen.findByRole('table', { name: 'Productos' })).closest<HTMLElement>('.tabla-contenedor')!
    contenedor.focus()

    await u.keyboard('{ArrowDown}{ArrowDown}')
    expect(await screen.findByRole('complementary', { name: 'Bujía CR7HSA' })).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Bujía CR7HSA' })).not.toBeInTheDocument()
  })

  it('Ctrl+N abre el formulario de producto nuevo para el dueño', async () => {
    abrir()

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(await screen.findByRole('dialog', { name: 'Nuevo producto' })).toBeInTheDocument()
  })

  it('Editar abre solo el formulario, no la ficha', async () => {
    abrir()
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Editar Pastillas de freno Pulsar 180' }))

    expect(await screen.findByRole('dialog', { name: /Editar Pastillas/ })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Pastillas de freno Pulsar 180' })).not.toBeInTheDocument()
  })

  it('sin producto elegido el registro invita a elegir uno', async () => {
    abrir()
    await screen.findByRole('table', { name: 'Productos' })

    expect(screen.getByText('Elige un producto para ver su ficha.')).toBeInTheDocument()
  })
})
