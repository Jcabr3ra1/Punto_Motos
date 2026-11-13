import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailySettlement } from '../../api/types'
import { dueno, errorDeApi, simularApi } from '../../test/apiSimulada'
import { caja, liquidacion, mecanico, paginaDe, tipoDeServicio } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

const DIA: DailySettlement = {
  date: '2026-11-07',
  total: 186000,
  mechanics: [
    { mechanic: { id: 1, name: 'Pedro' }, services_count: 7, labor_total: 200000, percentage: 60, share: 120000, deductions_total: 0, amount: 120000 },
    { mechanic: { id: 2, name: 'Luis' }, services_count: 4, labor_total: 110000, percentage: 60, share: 66000, deductions_total: 0, amount: 66000 },
  ],
}

function abrir(ruta: string) {
  const { services: _s, deductions: _d, ...lista } = liquidacion()
  simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true, session: caja() } }),
    'GET /mechanic-settlements/daily*': () => ({ cuerpo: DIA }),
    'GET /mechanic-deductions*': () => ({ cuerpo: paginaDe([]) }),
    'GET /mechanic-settlements*': (_, r) =>
      String(r).includes('page_size=1') ? { cuerpo: paginaDe([], { count: 12 }) } : { cuerpo: paginaDe([lista]) },
    'GET /mechanic-settlements/7': () => ({ cuerpo: liquidacion() }),
    'GET /mechanics*': () => ({ cuerpo: [mecanico(), mecanico({ id: 2, name: 'Inactivo', is_active: false })] }),
    'GET /service-types*': () => ({ cuerpo: [tipoDeServicio()] }),
  })
  mostrarRutas(dueno, ruta)
}

const cifras = async () => {
  const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
  return () => within(indicadores).getAllByRole('definition').map((d) => d.textContent?.replace(/\s/g, ' '))
}

describe('vistas de taller', () => {
  it('la liquidación del día muestra el total, los mecánicos y los servicios', async () => {
    abrir('/taller/liquidacion')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['$ 186.000', '2', '11']))
  })

  it('el historial cuenta todas las liquidaciones y abre la ficha con sus servicios', async () => {
    abrir('/taller/historial')
    const u = userEvent.setup()

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['12']))
    await u.click(within(await screen.findByRole('table', { name: 'Liquidaciones pagadas' })).getByText('Carlos Ruiz'))

    const ficha = await screen.findByRole('complementary', { name: 'Liquidación de Carlos Ruiz' })
    await waitFor(() => expect(ficha).toHaveTextContent('Cambio de aceite'))
    // La hoja se abre en una ventana emergente encima del historial, sin salir de la pantalla.
    await u.click(within(ficha).getByRole('button', { name: 'Abrir la hoja' }))
    const ventana = await screen.findByRole('dialog', { name: 'Liquidación de Carlos Ruiz' })
    expect(within(ventana).getByRole('article', { name: 'Hoja de liquidación de Carlos Ruiz' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Historial de liquidaciones' })).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mecánicos cuenta solo los activos y Ctrl+N abre uno nuevo', async () => {
    abrir('/taller/mecanicos')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['1']))
    await userEvent.setup().keyboard('{Control>}n{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Nuevo mecánico' })).toBeInTheDocument()
  })

  it('tipos de servicio cuenta los activos', async () => {
    abrir('/taller/servicios')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['1']))
  })

  it('mecánicos permite eliminar uno sin historial', async () => {
    const api = simularApi({
      'GET /mechanics*': () => ({ cuerpo: [mecanico({ id: 1, name: 'Carlos Pérez', is_active: true })] }),
      'DELETE /mechanics/1': () => ({ estado: 204 }),
    })
    mostrarRutas(dueno, '/taller/mecanicos')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Eliminar a Carlos Pérez' }))
    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar a Carlos Pérez?' })
    await u.click(within(dialogo).getByRole('button', { name: 'Sí, eliminar' }))

    await waitFor(() => expect(api.llamadas.some((l) => l.clave === 'DELETE /mechanics/1')).toBe(true))
    expect(await screen.findByText('Mecánico «Carlos Pérez» eliminado.')).toBeInTheDocument()
  })

  it('mecánicos ofrece desactivar si tiene historial (409)', async () => {
    const api = simularApi({
      'GET /mechanics*': () => ({ cuerpo: [mecanico({ id: 1, name: 'Carlos Pérez', is_active: true })] }),
      'DELETE /mechanics/1': () =>
        errorDeApi(409, 'mechanic_has_history', 'Este mecánico ya tiene servicios, liquidaciones o descuentos y no se puede eliminar.'),
      'PATCH /mechanics/1': () => ({ cuerpo: mecanico({ id: 1, name: 'Carlos Pérez', is_active: false }) }),
    })
    mostrarRutas(dueno, '/taller/mecanicos')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Eliminar a Carlos Pérez' }))
    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar a Carlos Pérez?' })
    await u.click(within(dialogo).getByRole('button', { name: 'Sí, eliminar' }))

    expect(
      await within(dialogo).findByText('Este mecánico ya tiene servicios, liquidaciones o descuentos y no se puede eliminar.'),
    ).toBeInTheDocument()
    await u.click(within(dialogo).getByRole('button', { name: 'Desactivar mecánico' }))

    await waitFor(() =>
      expect(api.llamadas.some((l) => l.clave === 'PATCH /mechanics/1' && JSON.stringify(l.cuerpo) === '{"is_active":false}')).toBe(true),
    )
    expect(await screen.findByText('Mecánico «Carlos Pérez» desactivado.')).toBeInTheDocument()
  })
})
