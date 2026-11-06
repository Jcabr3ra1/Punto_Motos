import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaleDetail } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { paginaDe, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

const llamadas = (api: { llamadas: { clave: string }[] }, prefijo: string) =>
  api.llamadas.filter((l) => l.clave.startsWith(prefijo)).map((l) => l.clave)

describe('historial de ventas', () => {
  it('lista las ventas con su cliente y marca las anuladas', async () => {
    simularApi({ 'GET /sales*': () => ({ cuerpo: paginaDe([venta(), venta({ id: 40, number: 40, is_voided: true })]) }) })
    mostrarRutas(vendedor, '/venta/historial')

    expect(await screen.findByRole('link', { name: 'N.º 41' })).toHaveAttribute('href', '/venta/historial/41')
    expect(screen.getByRole('row', { name: /N\.º 40/ })).toHaveTextContent('Anulada')
    expect(screen.getByRole('row', { name: /N\.º 41/ })).toHaveTextContent('3001234567')
  })

  it('filtra por número, estado y fechas', async () => {
    const api = simularApi({ 'GET /sales*': () => ({ cuerpo: paginaDe([venta()]) }) })
    mostrarRutas(dueno, '/venta/historial')
    const u = userEvent.setup()
    await screen.findByRole('table')

    await u.selectOptions(screen.getByLabelText('Estado'), 'Anuladas')
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-03' } })

    await waitFor(() => expect(llamadas(api, 'GET /sales')).toContain('GET /sales?voided=true&date_from=2026-11-03'))
  })
})

describe('detalle y anulación', () => {
  it('el vendedor ve el recibo pero no puede anular', async () => {
    simularApi({ 'GET /sales/41': () => ({ cuerpo: venta() }) })
    mostrarRutas(vendedor, '/venta/historial/41')

    expect(await screen.findByRole('article', { name: 'Recibo n.º 41' })).toHaveTextContent('Ana Gómez')
    expect(screen.queryByRole('button', { name: /Anular/ })).not.toBeInTheDocument()
  })

  it('el dueño anula con motivo y la venta queda marcada', async () => {
    let datos: SaleDetail = venta()
    const api = simularApi({
      'GET /sales/41': () => ({ cuerpo: datos }),
      'POST /sales/41/void': (cuerpo) => {
        datos = venta({ is_voided: true, voided_by: 'dueno', voided_at: '2026-11-03T11:00:00-05:00', void_reason: (cuerpo as { reason: string }).reason })
        return { cuerpo: datos }
      },
    })
    mostrarRutas(dueno, '/venta/historial/41')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Anular venta…' }))
    expect(screen.getByRole('group', { name: '¿Anular la venta n.º 41?' })).toHaveTextContent(/las unidades vuelven al inventario/)
    await u.type(screen.getByLabelText('Motivo'), 'Se cobró al cliente equivocado')
    await u.click(screen.getByRole('button', { name: 'Sí, anular la venta' }))

    expect(await screen.findByText(/Venta n\.º 41 anulada/)).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Recibo n.º 41' })).toHaveTextContent('Motivo: Se cobró al cliente equivocado')
    expect(screen.queryByRole('button', { name: 'Anular venta…' })).not.toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /sales/41/void')?.cuerpo).toEqual({ reason: 'Se cobró al cliente equivocado' })
  })

  it('sin motivo muestra el error junto al campo', async () => {
    simularApi({
      'GET /sales/41': () => ({ cuerpo: venta() }),
      'POST /sales/41/void': () => errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { reason: ['Este campo no puede estar en blanco.'] }),
    })
    mostrarRutas(dueno, '/venta/historial/41')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Anular venta…' }))
    await u.click(screen.getByRole('button', { name: 'Sí, anular la venta' }))

    expect(await screen.findByText('Este campo no puede estar en blanco.')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo')).toHaveAccessibleDescription(/en blanco/)
  })

  it('sin caja abierta lo explica', async () => {
    simularApi({
      'GET /sales/41': () => ({ cuerpo: venta() }),
      'POST /sales/41/void': () => errorDeApi(409, 'cash_session_closed', 'La caja está cerrada: ábrela para registrar dinero.'),
    })
    mostrarRutas(dueno, '/venta/historial/41')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Anular venta…' }))
    await u.type(screen.getByLabelText('Motivo'), 'Error')
    await u.click(screen.getByRole('button', { name: 'Sí, anular la venta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La caja está cerrada')
  })

  it('una venta con precio cambiado muestra el de catálogo en el recibo', async () => {
    simularApi({
      'GET /sales/41': () => ({
        cuerpo: venta({ items: [{ ...venta().items[0], unit_price: 22000, price_changed: true, subtotal: 22000 }] }),
      }),
    })
    mostrarRutas(dueno, '/venta/historial/41')

    expect(await screen.findByText(/Precio de catálogo \$\s?25\.000/)).toBeInTheDocument()
  })

  it('muestra el mensaje del backend cuando no se puede anular porque ya tiene devoluciones o servicios liquidados', async () => {
    simularApi({
      'GET /sales/41': () => ({ cuerpo: venta() }),
      'POST /sales/41/void': () =>
        errorDeApi(409, 'sale_has_returns', 'Esta venta ya tiene devoluciones y no se puede anular.'),
    })
    mostrarRutas(dueno, '/venta/historial/41')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Anular venta…' }))
    await u.type(screen.getByLabelText('Motivo'), 'Error')
    await u.click(screen.getByRole('button', { name: 'Sí, anular la venta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta venta ya tiene devoluciones y no se puede anular.')
  })
})
