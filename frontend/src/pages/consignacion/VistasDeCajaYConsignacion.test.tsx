import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi } from '../../test/apiSimulada'
import { caja, local, paginaDe } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(ruta: string) {
  const api = simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true, session: caja() } }),
    'GET /cash-sessions*': () => ({ cuerpo: paginaDe([caja({ id: 3, is_open: false, counted_cash: 75000, difference: 0 })], { count: 9 }) }),
    'GET /cash-sessions/3': () => ({ cuerpo: caja({ id: 3, is_open: false, counted_cash: 75000, difference: 0 }) }),
    'GET /cash-movements*': () => ({ cuerpo: paginaDe([]) }),
    'GET /consignees*': () => ({ cuerpo: [local({ balance_due: 640000 }), local({ id: 2, name: 'Sin deuda', balance_due: 0 })] }),
    'GET /consignment-deliveries*': (_, r) => ({ cuerpo: paginaDe([], { count: String(r).includes('page_size=1') ? 4 : 0 }) }),
    'GET /consignment-reports*': (_, r) => ({ cuerpo: paginaDe([], { count: String(r).includes('page_size=1') ? 2 : 0 }) }),
    'GET /consignee-payments*': (_, r) => ({ cuerpo: paginaDe([], { count: String(r).includes('page_size=1') ? 6 : 0 }) }),
  })
  mostrarRutas(dueno, ruta)
  return api
}

async function cifras() {
  const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
  return () => within(indicadores).getAllByRole('definition').map((d) => d.textContent?.replace(/\s/g, ' '))
}

describe('vistas de caja y consignación', () => {
  it('cajas anteriores cuenta las cajas y abre la ficha con su resumen', async () => {
    abrir('/caja/historial')
    const u = userEvent.setup()

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['9']))
    await u.click(within(await screen.findByRole('table', { name: 'Cajas' })).getByText('Abrió dueno'))

    const ficha = await screen.findByRole('complementary', { name: /Caja del/ })
    await waitFor(() => expect(within(ficha).getByLabelText('Cifras de la caja')).toHaveTextContent('Cuadró'))
    expect(within(ficha).getByRole('link', { name: 'Abrir la caja' })).toHaveAttribute('href', '/caja/historial/3')
  })

  it('locales suma lo que deben y cuenta cuáles', async () => {
    abrir('/consignacion/locales')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['$ 640.000', '1']))
  })

  it.each([
    ['/consignacion/entregas', 'Entregas este mes', '4'],
    ['/consignacion/reportes', 'Reportes este mes', '2'],
    ['/consignacion/pagos', 'Pagos este mes', '6'],
  ])('%s cuenta lo del mes', async (ruta, rotulo, cifra) => {
    abrir(ruta)

    const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
    expect(within(indicadores).getByRole('term')).toHaveTextContent(rotulo)
    await waitFor(() => expect(within(indicadores).getByRole('definition')).toHaveTextContent(cifra))
  })
})
