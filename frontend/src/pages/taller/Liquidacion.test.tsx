import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailySettlement } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor, type Respuesta } from '../../test/apiSimulada'
import { liquidacion, mecanico, paginaDe } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const conDeuda: DailySettlement = {
  date: '2026-11-03',
  mechanics: [
    { mechanic: { id: 1, name: 'Carlos Ruiz' }, services_count: 2, labor_total: 30000, percentage: 60, amount: 18000 },
    { mechanic: { id: 2, name: 'Pedro Gómez' }, services_count: 1, labor_total: 15000, percentage: 50, amount: 7500 },
  ],
  total: 25500,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true, session: null, suggested_opening_cash: 0 } }),
    'GET /mechanic-settlements/daily*': () => ({ cuerpo: conDeuda }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/taller')
  return { api, u: userEvent.setup() }
}

describe('liquidación del día', () => {
  it('muestra lo que se le debe a cada mecánico y el total que sale de la caja', async () => {
    abrir()

    const fila = await screen.findByRole('row', { name: /Carlos Ruiz/ })
    expect(fila).toHaveTextContent(/2\$\s?30\.00060 %\$\s?18\.000/)
    expect(screen.getByRole('row', { name: /Total que saldría de la caja/ })).toHaveTextContent(/\$\s?25\.500/)
  })

  it('paga con confirmación y el medio elegido, y muestra la hoja del mecánico', async () => {
    let datos = conDeuda
    const { api, u } = abrir({
      'GET /mechanic-settlements/daily*': () => ({ cuerpo: datos }),
      'POST /mechanic-settlements/daily': () => {
        datos = { ...conDeuda, mechanics: conDeuda.mechanics.slice(1), total: 7500 }
        return { estado: 201, cuerpo: liquidacion({ method: 'transfer', method_label: 'Transferencia' }) }
      },
    })

    await u.click(await screen.findByRole('button', { name: 'Pagar a Carlos Ruiz' }))
    const confirmacion = screen.getByRole('group', { name: /¿Pagarle \$\s?18\.000 a Carlos Ruiz\?/ })
    expect(confirmacion).toHaveTextContent(/2 servicios con \$\s?30\.000 de mano de obra, al 60 %/)
    expect(within(confirmacion).getByRole('button', { name: 'Volver' })).toHaveFocus()
    await u.click(screen.getByLabelText('Transferencia'))
    await u.click(screen.getByRole('button', { name: 'Sí, pagar' }))

    expect(await screen.findByText(/Se le pagaron \$\s?18\.000 a Carlos Ruiz\./)).toBeInTheDocument()
    const hoja = screen.getByRole('article', { name: 'Hoja de liquidación de Carlos Ruiz' })
    expect(hoja).toHaveTextContent('Juan Pérez')
    expect(hoja).toHaveTextContent(/Pagado al mecánico \(60 %\)\$\s?18\.000/)
    expect(api.llamadas.find((l) => l.clave === 'POST /mechanic-settlements/daily')?.cuerpo).toMatchObject({ mechanic: 1, method: 'transfer' })
    await waitFor(() => expect(screen.queryByRole('row', { name: /Carlos Ruiz 2/ })).not.toBeInTheDocument())
  })

  it('envía una sola vez aunque se pulse varias veces', async () => {
    let terminar: (r: Respuesta) => void = () => {}
    const { api, u } = abrir({ 'POST /mechanic-settlements/daily': () => new Promise<Respuesta>((r) => (terminar = r)) })

    await u.click(await screen.findByRole('button', { name: 'Pagar a Carlos Ruiz' }))
    const pagar = screen.getByRole('button', { name: 'Sí, pagar' })
    await u.dblClick(pagar)

    expect(api.cuantas('POST /mechanic-settlements/daily')).toBe(1)
    await act(async () => terminar({ estado: 201, cuerpo: liquidacion() }))
  })

  it('si ya no había nada que pagar (409), lo explica y vuelve a cargar la vista previa', async () => {
    const { api, u } = abrir({
      'POST /mechanic-settlements/daily': () => errorDeApi(409, 'nothing_to_settle', 'El mecánico no tiene servicios pendientes de pago ese día.'),
    })

    await u.click(await screen.findByRole('button', { name: 'Pagar a Carlos Ruiz' }))
    await u.click(screen.getByRole('button', { name: 'Sí, pagar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El mecánico no tiene servicios pendientes de pago ese día.')
    await waitFor(() => expect(api.llamadas.filter((l) => l.clave.startsWith('GET /mechanic-settlements/daily')).length).toBeGreaterThan(1))
  })

  it('con la caja cerrada no deja pagar y ofrece abrirla', async () => {
    abrir({ 'GET /cash-sessions/current': () => ({ cuerpo: { is_open: false, session: null, suggested_opening_cash: 0 } }) })

    expect(await screen.findByRole('link', { name: 'Abrir la caja' })).toHaveAttribute('href', '/caja/actual')
    expect(screen.getByRole('button', { name: 'Pagar a Carlos Ruiz' })).toBeDisabled()
  })

  it('se puede liquidar otro día y avisa si no hay nada pendiente', async () => {
    const { api } = abrir({
      'GET /mechanic-settlements/daily*': (_, ruta) => ({ cuerpo: ruta.includes('2026-11-01') ? { date: '2026-11-01', mechanics: [], total: 0 } : conDeuda }),
    })
    await screen.findByRole('row', { name: /Carlos Ruiz/ })

    fireEvent.change(screen.getByLabelText('Día a liquidar'), { target: { value: '2026-11-01' } })

    expect(await screen.findByText('No hay servicios sin pagar ese día.')).toBeInTheDocument()
    expect(api.llamadas.some((l) => l.clave === 'GET /mechanic-settlements/daily?date=2026-11-01')).toBe(true)
  })
})

describe('historial de liquidaciones', () => {
  it('lista lo pagado, filtra por mecánico y abre la hoja', async () => {
    const api = simularApi({
      'GET /mechanic-settlements*': () => ({ cuerpo: paginaDe([liquidacion()]) }),
      'GET /mechanic-settlements/7': () => ({ cuerpo: liquidacion() }),
      'GET /mechanics*': () => ({ cuerpo: [mecanico()] }),
    })
    mostrarRutas(dueno, '/taller/historial')
    const u = userEvent.setup()

    const fila = await screen.findByRole('row', { name: /Carlos Ruiz/ })
    expect(fila).toHaveTextContent(/\$\s?18\.000/)
    await u.selectOptions(screen.getByLabelText('Mecánico'), 'Carlos Ruiz')
    await waitFor(() => expect(api.llamadas.some((l) => l.clave === 'GET /mechanic-settlements?mechanic=1')).toBe(true))

    await u.click(within(screen.getByRole('row', { name: /Carlos Ruiz/ })).getByRole('link'))
    expect(await screen.findByRole('article', { name: 'Hoja de liquidación de Carlos Ruiz' })).toBeInTheDocument()
  })

  it('el vendedor no entra al taller', () => {
    simularApi({})
    mostrarRutas(vendedor, '/taller')

    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})
