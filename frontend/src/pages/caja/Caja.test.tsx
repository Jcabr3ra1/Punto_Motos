import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrentCash } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { caja, paginaDe } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const movimiento = {
  id: 1,
  session: 3,
  kind: 'sale',
  kind_label: 'Venta',
  method: 'cash',
  method_label: 'Efectivo',
  amount: 28000,
  reason: 'Venta 41 · Ana Gómez',
  sale: 41,
  sale_number: 41,
  supplier_payment: null,
  consignee_payment: null,
  created_by: 'ana',
  created_at: '2026-11-03T10:15:00-05:00',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(actual: () => CurrentCash, rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: actual() }),
    'GET /cash-movements*': () => ({ cuerpo: paginaDe([movimiento]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/caja')
  return { api, u: userEvent.setup() }
}

describe('abrir la caja', () => {
  it('propone el efectivo contado en el último cierre y la abre', async () => {
    let estado: CurrentCash = { is_open: false, session: null, suggested_opening_cash: 56000 }
    const { api, u } = abrir(() => estado, {
      'POST /cash-sessions': () => {
        estado = { is_open: true, session: caja({ opening_cash: 56000 }), suggested_opening_cash: 56000 }
        return { estado: 201, cuerpo: caja({ opening_cash: 56000 }) }
      },
    })

    const efectivo = await screen.findByLabelText('Efectivo en el cajón al abrir')
    expect(efectivo).toHaveValue(56000)
    await u.click(screen.getByRole('button', { name: 'Abrir caja' }))

    expect(await screen.findByText(/Caja abierta con \$\s?56\.000/)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /cash-sessions')?.cuerpo).toEqual({ opening_cash: 56000 })
    expect(await screen.findByLabelText('Cifras de la caja')).toBeInTheDocument()
  })
})

describe('caja abierta', () => {
  it('muestra el esperado, el resumen por tipo y los movimientos', async () => {
    abrir(() => ({ is_open: true, session: caja(), suggested_opening_cash: 0 }))

    const cifras = await screen.findByLabelText('Cifras de la caja')
    expect(cifras).toHaveTextContent(/Efectivo esperado en el cajón\$\s?75\.000/)
    expect(cifras).toHaveTextContent(/Transferencias\$\s?15\.000/)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver resumen por tipo' }))
    const resumen = screen.getByRole('list', { name: 'Resumen por tipo de movimiento' })
    expect(within(resumen).getByText(/Gasto/).closest('li')).toHaveTextContent(/-\$\s?3\.000/)
    expect(await screen.findByText('Venta 41 · Ana Gómez')).toBeInTheDocument()
  })

  it('gasto o retiro y cierre se abren en un panel con la caja detrás', async () => {
    const { u } = abrir(() => ({ is_open: true, session: caja(), suggested_opening_cash: 0 }))

    await u.click(await screen.findByRole('button', { name: 'Registrar gasto o retiro' }))
    expect(screen.getByRole('dialog', { name: 'Registrar gasto o retiro' })).toBeInTheDocument()
    expect(screen.getByLabelText('Cifras de la caja')).toBeInTheDocument()
    await u.keyboard('{Escape}')

    await u.click(screen.getByRole('button', { name: 'Cerrar caja' }))
    expect(screen.getByRole('dialog', { name: 'Cerrar la caja' })).toBeInTheDocument()
  })

  it('al cerrar muestra el efectivo esperado contra el contado antes de confirmar', async () => {
    const { u } = abrir(() => ({ is_open: true, session: caja(), suggested_opening_cash: 0 }))

    await u.click(await screen.findByRole('button', { name: 'Cerrar caja' }))
    await u.type(screen.getByLabelText('Efectivo contado'), '74000')

    const vista = screen.getByText('Efectivo en el cajón').closest('.vista-previa')
    expect(vista).toHaveTextContent(/Efectivo en el cajón de \$\s?75\.000 a \$\s?74\.000/)
    expect(vista).toHaveTextContent(/Faltan \$\s?1\.000/)
  })

  it('registra un gasto con su motivo', async () => {
    const { api, u } = abrir(() => ({ is_open: true, session: caja(), suggested_opening_cash: 0 }), {
      'POST /cash-movements': () => ({ estado: 201, cuerpo: { ...movimiento, id: 2, kind: 'expense', kind_label: 'Gasto', amount: -3000, reason: 'Almuerzo' } }),
    })

    await u.click(await screen.findByRole('button', { name: 'Registrar gasto o retiro' }))
    await u.type(screen.getByLabelText('Valor'), '3000')
    await u.type(screen.getByLabelText('Motivo'), 'Almuerzo')
    await u.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(await screen.findByText(/Gasto de \$\s?3\.000 registrado/)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /cash-movements')?.cuerpo).toEqual({
      kind: 'expense',
      amount: 3000,
      method: 'cash',
      reason: 'Almuerzo',
    })
  })

  it('un retiro del dueño también se registra', async () => {
    const { api, u } = abrir(() => ({ is_open: true, session: caja(), suggested_opening_cash: 0 }), {
      'POST /cash-movements': () => ({ estado: 201, cuerpo: { ...movimiento, kind: 'owner_withdrawal', kind_label: 'Retiro del dueño', amount: -20000 } }),
    })

    await u.click(await screen.findByRole('button', { name: 'Registrar gasto o retiro' }))
    await u.click(screen.getByLabelText('Retiro del dueño'))
    await u.type(screen.getByLabelText('Valor'), '20000')
    await u.type(screen.getByLabelText('Motivo'), 'Para el banco')
    await u.click(screen.getByRole('button', { name: 'Registrar' }))

    await screen.findByText(/Retiro del dueño de \$\s?20\.000 registrado/)
    expect(api.llamadas.find((l) => l.clave === 'POST /cash-movements')?.cuerpo).toMatchObject({ kind: 'owner_withdrawal' })
  })

  it('al cerrar muestra la diferencia en vivo y exige la explicación si no cuadra', async () => {
    let cerrar = 0
    const { api, u } = abrir(() => ({ is_open: cerrar < 2, session: cerrar < 2 ? caja() : null, suggested_opening_cash: 74000 }), {
      'POST /cash-sessions/3/close': () =>
        ++cerrar === 1
          ? errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { notes: ['Faltan $1.000 frente a lo esperado: explica la diferencia.'] })
          : { cuerpo: caja({ is_open: false, counted_cash: 74000, difference: -1000, closing_notes: 'Faltó sencillo' }) },
    })

    await u.click(await screen.findByRole('button', { name: 'Cerrar caja' }))
    await u.type(screen.getByLabelText('Efectivo contado'), '74000')
    expect(screen.getByText(/Faltan \$\s?1\.000: explica la diferencia\./)).toBeInTheDocument()
    await u.click(within(screen.getByRole('dialog', { name: 'Cerrar la caja' })).getByRole('button', { name: 'Cerrar caja' }))
    expect(await screen.findByText('Faltan $1.000 frente a lo esperado: explica la diferencia.')).toBeInTheDocument()

    await u.type(screen.getByLabelText('Explicación'), 'Faltó sencillo')
    await u.click(within(screen.getByRole('dialog', { name: 'Cerrar la caja' })).getByRole('button', { name: 'Cerrar caja' }))

    expect(await screen.findByText(/Caja cerrada\. Contado: \$\s?74\.000\. Faltaron \$\s?1\.000\./)).toBeInTheDocument()
    expect(screen.getByText(/Motivo: Faltó sencillo\./)).toBeInTheDocument()
    expect(api.llamadas.filter((l) => l.clave === 'POST /cash-sessions/3/close').at(-1)?.cuerpo).toEqual({ counted_cash: 74000, notes: 'Faltó sencillo' })
  })
})

describe('cajas anteriores', () => {
  it('lista las cajas con su diferencia y abre el detalle', async () => {
    simularApi({
      'GET /cash-sessions*': () => ({ cuerpo: paginaDe([caja({ is_open: false, counted_cash: 74000, difference: -1000, closed_at: '2026-11-03T19:00:00-05:00', summary: undefined })]) }),
      'GET /cash-sessions/3': () => ({ cuerpo: caja({ is_open: false, counted_cash: 74000, difference: -1000, closing_notes: 'Faltó sencillo' }) }),
      'GET /cash-movements*': () => ({ cuerpo: paginaDe([movimiento]) }),
    })
    mostrarRutas(dueno, '/caja/historial')
    const u = userEvent.setup()

    const fila = (await screen.findAllByRole('row'))[1]
    expect(fila).toHaveTextContent(/Faltaron \$\s?1\.000/)
    await u.click(within(fila).getByRole('button', { name: /Abrir la caja del/ }))

    const ventana = await screen.findByRole('dialog', { name: /Caja del/ })
    expect(await within(ventana).findByLabelText('Cifras de la caja')).toHaveTextContent(/Faltan \$\s?1\.000/)
    expect(within(ventana).getByLabelText('Cifras de la caja')).toHaveTextContent('Explicación de la diferencia')
    expect(within(ventana).getByLabelText('Cifras de la caja')).toHaveTextContent('Faltó sencillo')
    expect(screen.getByRole('heading', { level: 2, name: 'Cajas anteriores' })).toBeInTheDocument()
  })
})

describe('permisos', () => {
  it('el vendedor no ve la caja', () => {
    simularApi({})
    mostrarRutas(vendedor, '/caja')

    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})
