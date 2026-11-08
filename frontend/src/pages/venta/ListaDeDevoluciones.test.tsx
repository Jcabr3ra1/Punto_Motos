import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi } from '../../test/apiSimulada'
import { devolucion, paginaDe } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir() {
  const { items: _i, services: _s, refunds: _r, mechanic_deduction: _m, ...lista } = devolucion()
  simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /sale-returns*': (_, ruta) =>
      String(ruta).includes('page_size=1') ? { cuerpo: paginaDe([], { count: 4 }) } : { cuerpo: paginaDe([lista]) },
    'GET /sale-returns/3': () => ({ cuerpo: devolucion() }),
  })
  mostrarRutas(dueno, '/venta/devoluciones')
}

describe('lista de devoluciones', () => {
  it('muestra cuántas devoluciones hubo hoy', async () => {
    abrir()

    const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
    await waitFor(() => expect(within(indicadores).getByRole('definition')).toHaveTextContent('4'))
    expect(within(indicadores).getByRole('term')).toHaveTextContent('Devoluciones de hoy')
  })

  it('un clic en la fila abre la ficha con lo devuelto y Esc la cierra', async () => {
    abrir()
    const u = userEvent.setup()

    await u.click(within(await screen.findByRole('table', { name: 'Devoluciones' })).getByText('Ana Gómez'))

    const ficha = await screen.findByRole('complementary', { name: 'Devolución N.º 3' })
    await waitFor(() => expect(ficha).toHaveTextContent('Pastillas de freno Pulsar 180'))
    expect(ficha).toHaveTextContent('Vuelve al inventario')
    within(ficha).getByRole('button', { name: 'Cerrar la ficha' }).focus()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Devolución N.º 3' })).not.toBeInTheDocument()
  })
})
