import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { local, paginaDe, pendiente, producto } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const zapatas = producto({ id: 2, code: 'FRE-BOX-ZAP', name: 'Zapatas traseras Boxer', cost_price: 9000, sale_price: 14000, stock: 4 })
const centro = local({ balance_due: 9000 })

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(ruta: string, rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /consignees*': () => ({ cuerpo: [centro] }),
    'GET /consignment-deliveries*': () => ({ cuerpo: paginaDe([]) }),
    'GET /consignment-reports*': () => ({ cuerpo: paginaDe([]) }),
    'GET /consignee-payments*': () => ({ cuerpo: paginaDe([]) }),
    'GET /catalog/search*': () => ({ cuerpo: [zapatas] }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
  mostrarRutas(dueno, ruta)
  return { api, u: userEvent.setup() }
}

describe('locales', () => {
  it('muestra lo que debe cada local y lo que todavía tiene', async () => {
    const { u } = abrir('/consignacion', { 'GET /consignees/1/pending-items': () => ({ cuerpo: [pendiente()] }) })

    const fila = await screen.findByRole('row', { name: /Motos del Centro/ })
    expect(fila).toHaveTextContent(/\$\s?9\.000/)
    await u.click(within(fila).getByRole('button', { name: 'Lo que tiene Motos del Centro' }))

    expect(await screen.findByRole('row', { name: /Zapatas traseras Boxer/ })).toHaveTextContent('4 de 4')
  })

  it('crea un local y muestra el error de nombre repetido', async () => {
    let intento = 0
    const { u } = abrir('/consignacion/locales', {
      'POST /consignees': () =>
        ++intento === 1
          ? errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { name: ['Ya existe un local con ese nombre.'] })
          : { estado: 201, cuerpo: local({ id: 2, name: 'Motos Sur' }) },
    })

    await u.click(await screen.findByRole('button', { name: 'Nuevo local' }))
    await u.type(screen.getByLabelText('Nombre'), 'Motos del Centro')
    await u.click(screen.getByRole('button', { name: 'Crear local' }))
    expect(await screen.findByText('Ya existe un local con ese nombre.')).toBeInTheDocument()

    await u.clear(screen.getByLabelText('Nombre'))
    await u.type(screen.getByLabelText('Nombre'), 'Motos Sur')
    await u.click(screen.getByRole('button', { name: 'Crear local' }))
    expect(await screen.findByText('Local «Motos Sur» creado.')).toBeInTheDocument()
  })
})

describe('entregas', () => {
  it('precarga el valor pactado con el costo y envía la entrega con su clave', async () => {
    const { api, u } = abrir('/consignacion/entregas', {
      'POST /consignment-deliveries': () => ({
        estado: 201,
        cuerpo: { id: 1, consignee: { id: 1, name: 'Motos del Centro' }, notes: '', items: [], total_value: 18000, created_by: 'dueno', created_at: 'x' },
      }),
    })

    await u.click(await screen.findByRole('button', { name: 'Nueva entrega' }))
    await u.selectOptions(await screen.findByLabelText('Local'), 'Motos del Centro')
    await u.type(screen.getByRole('combobox', { name: 'Agregar producto' }), 'zap')
    await u.click(await screen.findByRole('option', { name: /FRE-BOX-ZAP/, selected: true }))
    expect(screen.getByLabelText('Valor pactado de Zapatas traseras Boxer')).toHaveValue(9000)
    await u.clear(screen.getByLabelText('Cantidad de Zapatas traseras Boxer'))
    await u.type(screen.getByLabelText('Cantidad de Zapatas traseras Boxer'), '2')
    await u.click(screen.getByRole('button', { name: 'Registrar entrega' }))

    expect(await screen.findByText(/Entrega a «Motos del Centro» registrada por \$\s?18\.000/)).toBeInTheDocument()
    const cuerpo = api.llamadas.find((l) => l.clave === 'POST /consignment-deliveries')?.cuerpo as Record<string, unknown>
    expect(cuerpo).toMatchObject({ consignee: 1, items: [{ product: 2, quantity: 2, unit_value: 9000 }] })
    expect(cuerpo.idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('reportes', () => {
  it('se arma con lo pendiente y el error de una línea sale junto a ella', async () => {
    const segundo = pendiente({ id: 6, product: { id: 4, code: 'MO-PUL-FIL', name: 'Filtro de aceite Pulsar 180' }, pending_quantity: 3, quantity: 3, unit_value: 12000 })
    let intento = 0
    const { api, u } = abrir('/consignacion/reportes', {
      'GET /consignees/1/pending-items': () => ({ cuerpo: [pendiente(), segundo] }),
      'POST /consignment-reports': () =>
        ++intento === 1
          ? errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { lines: [{ sold: ['Al local le quedan 3 de MO-PUL-FIL.'] }] })
          : {
              estado: 201,
              cuerpo: { id: 1, consignee: { id: 1, name: 'Motos del Centro' }, total: 24000, notes: '', lines: [], created_by: 'dueno', created_at: 'x' },
            },
    })

    await u.click(await screen.findByRole('button', { name: 'Nuevo reporte' }))
    await u.selectOptions(await screen.findByLabelText('Local'), 'Motos del Centro')
    // Solo se llena la segunda fila: su error llega como la línea 0 de lo enviado.
    await u.type(await screen.findByLabelText('Vendidas de Filtro de aceite Pulsar 180 (entrega 1)'), '5')
    await u.click(screen.getByRole('button', { name: 'Registrar reporte' }))

    const fila = screen.getByRole('row', { name: /Filtro de aceite Pulsar 180/ })
    expect(await within(fila).findByText('Al local le quedan 3 de MO-PUL-FIL.')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Zapatas traseras Boxer/ })).queryByText(/Al local le quedan/)).not.toBeInTheDocument()

    await u.clear(screen.getByLabelText('Vendidas de Filtro de aceite Pulsar 180 (entrega 1)'))
    await u.type(screen.getByLabelText('Vendidas de Filtro de aceite Pulsar 180 (entrega 1)'), '2')
    await u.type(screen.getByLabelText('Devueltas de Zapatas traseras Boxer (entrega 1)'), '1')
    expect(screen.getByRole('row', { name: /Sube el saldo/ })).toHaveTextContent(/\$\s?24\.000/)
    await u.click(screen.getByRole('button', { name: 'Registrar reporte' }))

    expect(await screen.findByText(/su saldo sube \$\s?24\.000/)).toBeInTheDocument()
    expect(api.llamadas.filter((l) => l.clave === 'POST /consignment-reports').at(-1)?.cuerpo).toEqual({
      consignee: 1,
      lines: [
        { item: 5, returned: 1 },
        { item: 6, sold: 2 },
      ],
      notes: '',
    })
  })
})

describe('pagos', () => {
  it('registra el pago de un local mostrando lo que debe', async () => {
    const { api, u } = abrir('/consignacion/pagos', {
      'POST /consignee-payments': () => ({
        estado: 201,
        cuerpo: { id: 1, consignee: { id: 1, name: 'Motos del Centro' }, amount: 5000, method: 'cash', method_label: 'Efectivo', notes: '', created_by: 'dueno', created_at: 'x' },
      }),
    })

    await u.click(await screen.findByRole('button', { name: 'Registrar pago' }))
    expect(await screen.findByRole('option', { name: /Motos del Centro · debe \$\s?9\.000/ })).toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Local'), '1')
    await u.type(screen.getByLabelText('Valor'), '5000')
    await u.click(screen.getByRole('button', { name: 'Registrar pago' }))

    expect(await screen.findByText(/Pago de \$\s?5\.000 de «Motos del Centro» registrado/)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /consignee-payments')?.cuerpo).toEqual({ consignee: 1, amount: 5000, method: 'cash', notes: '' })
  })

  it('sin caja abierta lo explica', async () => {
    const { u } = abrir('/consignacion/pagos', {
      'POST /consignee-payments': () => errorDeApi(409, 'cash_session_closed', 'La caja está cerrada: ábrela para registrar dinero.'),
    })

    await u.click(await screen.findByRole('button', { name: 'Registrar pago' }))
    await u.selectOptions(await screen.findByLabelText('Local'), '1')
    await u.type(screen.getByLabelText('Valor'), '5000')
    await u.click(screen.getByRole('button', { name: 'Registrar pago' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La caja está cerrada')
  })
})

describe('permisos', () => {
  it('el vendedor no entra a consignación', () => {
    simularApi({})
    mostrarRutas(vendedor, '/consignacion/entregas')

    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})
