import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi } from '../../test/apiSimulada'
import { abono, compra, paginaDe, proveedor } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /suppliers*': () => ({ cuerpo: [proveedor({ balance_due: 105000 }), proveedor({ id: 3, name: 'Motopartes Viejo', is_active: false, balance_due: 8000 })] }),
    'GET /supplier-payments*': () => ({ cuerpo: paginaDe([abono()]) }),
    'GET /purchases*': () => ({ cuerpo: paginaDe([compra()]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/compras/abonos')
  return { api, u: userEvent.setup() }
}

const llamadas = (api: { llamadas: { clave: string }[] }, prefijo: string) =>
  api.llamadas.filter((l) => l.clave.startsWith(prefijo)).map((l) => l.clave)

describe('lista de abonos', () => {
  it('muestra fecha de pago, proveedor, valor, medio y a qué compras se aplicó', async () => {
    abrir()

    const fila = (await screen.findByText('Nequi')).closest('tr')!
    expect(fila).toHaveTextContent('Distribuidora Andina')
    expect(fila).toHaveTextContent(/\$\s?45\.000/)
    expect(fila).toHaveTextContent('Transferencia')
    expect(screen.getByRole('link', { name: 'FV-1020' })).toHaveAttribute('href', '/compras/lista/15')
  })

  it('filtra por proveedor y fechas de pago', async () => {
    const { api, u } = abrir()
    await screen.findByRole('table')

    await u.selectOptions(screen.getByLabelText('Proveedor'), 'Distribuidora Andina')
    fireEvent.change(screen.getByLabelText('Pagados desde'), { target: { value: '2026-11-01' } })

    await waitFor(() => expect(llamadas(api, 'GET /supplier-payments')).toContain('GET /supplier-payments?supplier=1&date_from=2026-11-01'))
  })
})

describe('registrar abono', () => {
  it('se puede elegir una compra concreta, y a un proveedor desactivado también se le abona', async () => {
    const { api, u } = abrir({
      'POST /supplier-payments': () => ({ estado: 201, cuerpo: abono({ amount: 20000, method: 'cash', method_label: 'Efectivo' }) }),
    })
    await u.click(await screen.findByRole('button', { name: 'Registrar abono' }))

    const selector = await screen.findByLabelText('Proveedor')
    expect(screen.getByRole('option', { name: 'Motopartes Viejo (desactivado)' })).toBeInTheDocument()
    await u.selectOptions(selector, 'Distribuidora Andina')
    expect(screen.getByText(/Se le debe en total:/)).toHaveTextContent(/\$\s?105\.000/)
    await screen.findByRole('option', { name: /FV-1020/ })
    await u.selectOptions(screen.getByLabelText('Aplicar a'), '15')
    await u.type(screen.getByLabelText('Valor'), '20000')
    await u.click(screen.getByRole('button', { name: 'Registrar abono' }))

    expect(await screen.findByText(/Abono de \$\s?20\.000 registrado/)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /supplier-payments')?.cuerpo).toMatchObject({
      supplier: 1,
      purchase: 15,
      amount: 20000,
      method: 'cash',
    })
  })

  it('sin valor no inventa un cero: el error del backend sale junto al campo', async () => {
    const { api, u } = abrir({
      'POST /supplier-payments': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          amount: ['Este campo es requerido.'],
          paid_on: ['La fecha de pago no puede ser futura.'],
        }),
    })
    await u.click(await screen.findByRole('button', { name: 'Registrar abono' }))
    await u.selectOptions(await screen.findByLabelText('Proveedor'), 'Distribuidora Andina')
    await u.click(screen.getByRole('button', { name: 'Registrar abono' }))

    expect(await screen.findByText('Este campo es requerido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de pago')).toHaveAccessibleDescription(/no puede ser futura/)
    expect(api.llamadas.find((l) => l.clave === 'POST /supplier-payments')?.cuerpo).not.toHaveProperty('amount')
  })

  it('la fecha de pago viene con hoy y no permite fechas futuras', async () => {
    const { u } = abrir()
    await u.click(await screen.findByRole('button', { name: 'Registrar abono' }))

    const fecha = await screen.findByLabelText('Fecha de pago')
    expect(fecha).toHaveValue(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date()))
    expect(fecha).toHaveAttribute('max', (fecha as HTMLInputElement).value)
  })
})
