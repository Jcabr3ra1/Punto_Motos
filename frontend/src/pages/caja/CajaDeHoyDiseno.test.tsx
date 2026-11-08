import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CashSession } from '../../api/types'
import { useAreaAngosta } from '../../hooks/useAreaAngosta'
import { dueno, errorDeApi, simularApi } from '../../test/apiSimulada'
import { caja, paginaDe } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

vi.mock('../../hooks/useAreaAngosta', () => ({ useAreaAngosta: vi.fn(() => false) }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(useAreaAngosta).mockReturnValue(false)
})

const movimiento = {
  id: 1, session: 3, kind: 'sale', kind_label: 'Venta', method: 'cash', method_label: 'Efectivo',
  amount: 1000, reason: 'Venta de la primera página', created_by: 'dueno', created_at: '2026-11-03T10:15:00-05:00',
}

function mostrar(sesion: CashSession = caja(), rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true, session: sesion } }),
    'GET /cash-movements*': () => ({ cuerpo: paginaDe([movimiento], { count: 60, next: '?page=2' }) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/caja/actual')
  return { api, u: userEvent.setup() }
}

async function indicadores() {
  const region = await screen.findByRole('region', { name: 'Indicadores' })
  return within(region).getAllByRole('definition').map((valor) => valor.textContent?.replace(/\s/g, ' '))
}

describe('diario y cajón de hoy', () => {
  it('usa el resumen completo para entradas y salidas, aunque el diario esté paginado', async () => {
    mostrar(caja({
      expected_cash: 66000,
      summary: {
        by_kind: [
          { kind: 'sale', kind_label: 'Venta', cash: 28000, transfer: 90000 },
          { kind: 'consignee_payment', kind_label: 'Pago de local', cash: 2000, transfer: 3000 },
          { kind: 'expense', kind_label: 'Gasto', cash: -3000, transfer: -5000 },
          { kind: 'sale_refund', kind_label: 'Devolución', cash: -4000, transfer: 0 },
          { kind: 'owner_withdrawal', kind_label: 'Retiro', cash: -7000, transfer: 0 },
        ], cash_total: 16000, transfer_total: 88000,
      },
    }))

    expect(await indicadores()).toEqual(['$ 50.000', '+$ 30.000', '-$ 14.000', '$ 88.000'])
    expect(screen.getByLabelText('Cifras de la caja')).toHaveTextContent(/Efectivo esperado en el cajón\$\s?66\.000/)
    expect(await screen.findByText('Venta de la primera página')).toBeInTheDocument()
    expect(screen.getByText('Falta contar el efectivo.')).toBeInTheDocument()
  })

  it('las transferencias no aumentan el dinero del cajón', async () => {
    mostrar(caja({ expected_cash: 50000, summary: {
      by_kind: [{ kind: 'sale', kind_label: 'Venta', cash: 0, transfer: 15000 }], cash_total: 0, transfer_total: 15000,
    } }))

    expect(await indicadores()).toEqual(['$ 50.000', '$ 0', '$ 0', '$ 15.000'])
    expect(screen.getByLabelText('Cifras de la caja')).toHaveTextContent(/Efectivo esperado en el cajón\$\s?50\.000/)
  })

  it('distingue el resumen no disponible de importes cero', async () => {
    const { u } = mostrar(caja({ summary: undefined }))
    expect(await indicadores()).toEqual(['$ 50.000', '—', '—', '—'])
    await u.click(screen.getByRole('button', { name: 'Ver resumen por tipo' }))
    expect(screen.getByText('El resumen de esta caja no está disponible.')).toBeInTheDocument()
  })

  it('abre el resumen en una ficha y permite volver al cajón con el teclado', async () => {
    const { u } = mostrar()
    await u.click(await screen.findByRole('button', { name: 'Ver resumen por tipo' }))
    const ficha = screen.getByRole('complementary', { name: 'Resumen por tipo' })
    // En el panel negro, como líneas: la tabla de tres columnas no cabe.
    expect(within(ficha).getByRole('list', { name: 'Resumen por tipo de movimiento' })).toBeInTheDocument()
    expect(ficha).toHaveClass('registro')
    expect(within(ficha).getByRole('button', { name: 'Cerrar la ficha' })).toHaveFocus()
    await u.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Ver resumen por tipo' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Cerrar caja' })).toBeInTheDocument()
  })

  it('en área angosta muestra el resumen en PanelLateral y Esc devuelve el foco', async () => {
    vi.mocked(useAreaAngosta).mockReturnValue(true)
    const { u } = mostrar()
    await u.click(await screen.findByRole('button', { name: 'Ver resumen por tipo' }))
    expect(screen.getByRole('dialog', { name: 'Resumen por tipo' })).toBeInTheDocument()
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver resumen por tipo' })).toHaveFocus()
  })

  it('distingue una jornada vacía y conserva las acciones de caja', async () => {
    const { u } = mostrar(caja({ expected_cash: 50000, summary: { by_kind: [], cash_total: 0, transfer_total: 0 } }), {
      'GET /cash-movements*': () => ({ cuerpo: paginaDe([]) }),
    })
    expect(await indicadores()).toEqual(['$ 50.000', '$ 0', '$ 0', '$ 0'])
    expect(await screen.findByText('Todavía no hay movimientos en esta caja.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar gasto o retiro' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Ver resumen por tipo' }))
    expect(within(screen.getByRole('complementary', { name: 'Resumen por tipo' })).getByText('Todavía no hay movimientos en esta caja.')).toBeInTheDocument()
  })

  it('avanza el diario sin alterar los indicadores de la sesión', async () => {
    const { api, u } = mostrar(caja(), {
      'GET /cash-movements*': (_, ruta) => ({ cuerpo: ruta.includes('page=2')
        ? paginaDe([{ ...movimiento, id: 2, reason: 'Movimiento de la segunda página' }], { count: 60, previous: '?page=1' })
        : paginaDe([movimiento], { count: 60, next: '?page=2' }) }),
    })
    expect(await indicadores()).toEqual(['$ 50.000', '+$ 28.000', '-$ 3.000', '$ 15.000'])
    const diario = await screen.findByRole('region', { name: 'Movimientos de la caja' })
    await u.click(await within(diario).findByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Movimiento de la segunda página')).toBeInTheDocument()
    expect(api.llamadas.some((l) => l.clave.includes('session=3') && l.clave.includes('page=2'))).toBe(true)
    expect(await indicadores()).toEqual(['$ 50.000', '+$ 28.000', '-$ 3.000', '$ 15.000'])
  })

  it('permite ir y volver con diez movimientos por página solo desde el pie de la tabla', async () => {
    const { api, u } = mostrar(caja(), {
      'GET /cash-movements*': (_, ruta) => ({ cuerpo: ruta.includes('page=2')
        ? paginaDe([{ ...movimiento, id: 11, reason: 'Movimiento de la segunda página' }], { count: 12, previous: '?page=1' })
        : paginaDe(Array.from({ length: 10 }, (_, indice) => ({ ...movimiento, id: indice + 1 })), { count: 12, next: '?page=2' }) }),
    })
    const diario = await screen.findByRole('region', { name: 'Movimientos de la caja' })
    const pie = await within(diario).findByRole('navigation', { name: 'Páginas de movimientos de caja' })
    expect(within(pie).getByText('Página 1 de 2')).toBeInTheDocument()
    expect(within(pie).getByRole('button', { name: 'Atrás' })).toBeDisabled()
    await u.click(within(pie).getByRole('button', { name: 'Siguiente' }))
    expect(await within(diario).findByText('Movimiento de la segunda página')).toBeInTheDocument()
    expect(within(pie).getByText('Página 2 de 2')).toBeInTheDocument()
    expect(within(pie).getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    await u.click(within(pie).getByRole('button', { name: 'Atrás' }))
    expect(await within(diario).findAllByText('Venta de la primera página')).toHaveLength(10)
    expect(api.llamadas.filter((l) => l.clave.startsWith('GET /cash-movements'))
      .every((l) => l.clave.includes('page_size=10'))).toBe(true)
    expect(await indicadores()).toEqual(['$ 50.000', '+$ 28.000', '-$ 3.000', '$ 15.000'])
    expect(within(screen.getByRole('region', { name: 'Indicadores' })).queryByRole('navigation')).not.toBeInTheDocument()
  })

  it.each([0, 1])('mantiene el pie de tabla con ambos botones desactivados si hay %i movimientos', async (cantidad) => {
    mostrar(caja(), {
      'GET /cash-movements*': () => ({ cuerpo: paginaDe(cantidad ? [movimiento] : []) }),
    })
    const diario = await screen.findByRole('region', { name: 'Movimientos de la caja' })
    const pie = await within(diario).findByRole('navigation', { name: 'Páginas de movimientos de caja' })
    expect(within(pie).getByText('Página 1 de 1')).toBeInTheDocument()
    expect(within(pie).getByRole('button', { name: 'Atrás' })).toBeDisabled()
    expect(within(pie).getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('reintenta un fallo del diario sin perder el efectivo esperado', async () => {
    let falla = true
    const { u } = mostrar(caja(), {
      'GET /cash-movements*': () => falla ? errorDeApi(500, 'server_error', 'No se pudo leer el diario.') : { cuerpo: paginaDe([movimiento]) },
    })
    const diario = await screen.findByRole('region', { name: 'Movimientos de la caja' })
    expect(await within(diario).findByRole('alert')).toHaveTextContent('No se pudo leer el diario.')
    expect(screen.getByLabelText('Cifras de la caja')).toHaveTextContent(/75\.000/)
    falla = false
    await u.click(within(diario).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Venta de la primera página')).toBeInTheDocument()
  })
})
