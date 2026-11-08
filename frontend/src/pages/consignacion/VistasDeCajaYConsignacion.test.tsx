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
    await waitFor(() => expect(ficha).toHaveTextContent('Cuadró'))
    // La caja completa se abre en una ventana emergente encima de la lista, sin salir de la pantalla.
    await u.click(within(ficha).getByRole('button', { name: 'Abrir la caja' }))
    const ventana = await screen.findByRole('dialog', { name: /Caja del/ })
    expect(within(ventana).getByLabelText('Cifras de la caja')).toHaveTextContent('Cuadró')
    // Los movimientos de la caja van de 10 en 10, con Atrás y Siguiente siempre abajo.
    expect(await within(ventana).findByRole('navigation', { name: 'Páginas de movimientos de caja' })).toHaveTextContent('Atrás')
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cajas anteriores muestra el registro vacío, el pie fijo y pide el período elegido', async () => {
    const api = abrir('/caja/historial')
    const u = userEvent.setup()

    expect(await screen.findByText('Elige una caja para ver su resumen.')).toBeInTheDocument()
    expect(await screen.findByRole('navigation', { name: 'Páginas de cajas' })).toHaveTextContent('Atrás')
    expect(api.llamadas.some((l) => /^GET \/cash-sessions\?page_size=\d+$/.test(l.clave) && !l.clave.includes('page_size=1'))).toBe(true)

    await u.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: 'Este mes' }))
    await waitFor(() => expect(api.llamadas.some((l) => /^GET \/cash-sessions\?date_from=\d{4}-\d{2}-01&date_to=/.test(l.clave))).toBe(true))
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
