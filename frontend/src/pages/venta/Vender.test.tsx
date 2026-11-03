import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor, type Respuesta } from '../../test/apiSimulada'
import { paginaDe, producto, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const pastillas = producto({ id: 1, sale_price: 25000, stock: 3 })
const filtro = producto({ id: 4, code: 'MO-PUL-FIL', name: 'Filtro de aceite Pulsar 180', sale_price: 18000, stock: 7 })
const clienteAna = { id: 18, name: 'Ana Gómez', phone: '3001234567', notes: '', is_active: true }
const conteoCerrado = { is_open: false, finished_at: 'x', finished_by: 'dueno', products_counted: 1, units_counted: 1 }

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(usuario: User = vendedor, rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true } }),
    'GET /inventory/initial-count': () => ({ cuerpo: conteoCerrado }),
    'GET /catalog/search*': (_, ruta) => ({ cuerpo: ruta.includes('fil') ? [filtro] : [pastillas] }),
    'GET /customers*': () => ({ cuerpo: paginaDe([clienteAna]) }),
    ...rutas,
  })
  mostrarRutas(usuario, '/venta')
  return { api, u: userEvent.setup() }
}

async function agregar(u: ReturnType<typeof userEvent.setup>, texto: string) {
  const buscador = await screen.findByRole('combobox', { name: 'Buscar producto' })
  await u.type(buscador, texto)
  // Espera a que los resultados correspondan a lo escrito: los de la búsqueda anterior no se pueden elegir.
  await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(true))
  await u.keyboard('{Enter}')
}

async function elegirAna(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByRole('combobox', { name: 'Cliente' }), 'ana')
  await u.click(await screen.findByRole('option', { name: /Ana Gómez/ }))
}

const ventasEnviadas = (api: { llamadas: { clave: string; cuerpo: unknown }[] }) =>
  api.llamadas.filter((l) => l.clave === 'POST /sales').map((l) => l.cuerpo as Record<string, unknown>)

describe('vender', () => {
  it('arma el carrito, cobra en efectivo con vuelto y muestra el recibo del backend', async () => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta({ total: 50000 }) }) })

    await agregar(u, 'pas')
    await agregar(u, 'pas')
    expect(screen.getByLabelText('Cantidad de Pastillas de freno Pulsar 180')).toHaveValue(2)
    // El vendedor no puede cambiar el precio.
    expect(screen.queryByLabelText('Precio de Pastillas de freno Pulsar 180')).not.toBeInTheDocument()
    await elegirAna(u)
    expect(screen.getByLabelText('Total de la venta')).toHaveTextContent(/\$\s?50\.000/)
    await u.type(screen.getByLabelText('Efectivo que entrega el cliente'), '60000')
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent(/\$\s?10\.000/)

    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    expect(await screen.findByText(/Venta n\.º 41 registrada/)).toHaveTextContent(/Vuelto: \$\s?10\.000/)
    expect(screen.getByRole('article', { name: 'Recibo n.º 41' })).toBeInTheDocument()
    const [enviada] = ventasEnviadas(api)
    expect(enviada).toMatchObject({
      customer: 18,
      items: [{ product: 1, quantity: 2 }],
      // Se envía lo que se cobra, no lo que entregó el cliente.
      payments: [{ method: 'cash', amount: 50000 }],
    })
    expect(enviada.idempotency_key).toMatch(/^[0-9a-f-]{36}$/)
    expect(enviada).not.toHaveProperty('new_customer')
  })

  it('reparte el pago entre transferencia y efectivo y crea un cliente nuevo', async () => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta({ total: 43000 }) }) })

    await agregar(u, 'pas')
    await agregar(u, 'fil')
    await u.type(screen.getByRole('combobox', { name: 'Cliente' }), 'Juan Ruiz')
    await u.click(await screen.findByRole('option', { name: /Crear cliente nuevo/ }))
    expect(screen.getByLabelText('Nombre del cliente')).toHaveValue('Juan Ruiz')
    await u.type(screen.getByLabelText('Teléfono'), '3115556677')
    await u.click(screen.getByLabelText('Mixto'))
    await u.type(screen.getByLabelText('Valor por transferencia'), '20000')
    expect(screen.getByText(/Efectivo a cobrar:/)).toHaveTextContent(/\$\s?23\.000/)

    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(ventasEnviadas(api)[0]).toMatchObject({
      new_customer: { name: 'Juan Ruiz', phone: '3115556677' },
      payments: [
        { method: 'cash', amount: 23000 },
        { method: 'transfer', amount: 20000 },
      ],
    })
    expect(ventasEnviadas(api)[0].notes).toMatch(/^Parte por transferencia bancaria: \$\s?20\.000$/)
  })

  it('no deja cobrar sin cliente, ni si el efectivo no alcanza o la transferencia se pasa', async () => {
    const { u } = abrir()

    await agregar(u, 'pas')
    const cobrar = screen.getByRole('button', { name: /^Cobrar/ })
    expect(cobrar).toBeDisabled()
    expect(screen.getByText('Elige o crea el cliente para cobrar.')).toBeInTheDocument()

    await elegirAna(u)
    expect(cobrar).toBeEnabled()
    await u.type(screen.getByLabelText('Efectivo que entrega el cliente'), '20000')
    expect(screen.getByText(/Faltan \$\s?5\.000\./)).toBeInTheDocument()
    expect(cobrar).toBeDisabled()

    await u.clear(screen.getByLabelText('Efectivo que entrega el cliente'))
    await u.click(screen.getByLabelText('Mixto'))
    await u.type(screen.getByLabelText('Valor por transferencia'), '30000')
    expect(screen.getByText('No puede ser mayor que el total.')).toBeInTheDocument()
    expect(cobrar).toBeDisabled()
  })

  it('no permite pasar de la existencia disponible', async () => {
    const { u } = abrir()

    for (let i = 0; i < 4; i++) await agregar(u, 'pas')

    expect(screen.getByLabelText('Cantidad de Pastillas de freno Pulsar 180')).toHaveValue(3)
    expect(screen.getByText(/Ya agregaste todas las unidades disponibles/)).toBeInTheDocument()
  })

  it('reutiliza la misma clave en los reintentos y genera una nueva para la venta siguiente', async () => {
    let intento = 0
    const { api, u } = abrir(vendedor, {
      'POST /sales': () => (++intento === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { estado: 201, cuerpo: venta() }),
    })
    await agregar(u, 'pas')
    await elegirAna(u)

    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))
    await screen.findByRole('heading', { name: 'Venta registrada' })
    await u.click(screen.getByRole('button', { name: 'Nueva venta' }))
    await agregar(u, 'pas')
    await elegirAna(u)
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))
    await screen.findByRole('heading', { name: 'Venta registrada' })

    const [primera, reintento, siguiente] = ventasEnviadas(api).map((v) => v.idempotency_key)
    expect(reintento).toBe(primera)
    expect(siguiente).not.toBe(primera)
  })

  it('envía una sola vez aunque se pulse varias veces', async () => {
    let terminar: (r: Respuesta) => void = () => {}
    const { api, u } = abrir(vendedor, { 'POST /sales': () => new Promise<Respuesta>((r) => (terminar = r)) })
    await agregar(u, 'pas')
    await elegirAna(u)

    const cobrar = screen.getByRole('button', { name: /^Cobrar/ })
    await u.dblClick(cobrar)
    await u.click(cobrar)

    expect(ventasEnviadas(api)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cobrando…' })).toBeDisabled()
    await act(async () => terminar({ estado: 201, cuerpo: venta() }))
  })

  it('muestra los errores de cada línea junto al producto', async () => {
    const { u } = abrir(vendedor, {
      'POST /sales': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { items: [{ quantity: ['Solo hay 2 unidades de FRE-PUL-PAS.'] }] }),
    })
    await agregar(u, 'pas')
    await elegirAna(u)
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    const fila = screen.getByRole('row', { name: /Pastillas de freno Pulsar 180/ })
    expect(await within(fila).findByText('Solo hay 2 unidades de FRE-PUL-PAS.')).toBeInTheDocument()
  })
})

describe('medio de pago', () => {
  it('por defecto es efectivo y el selector muestra los cuatro medios', async () => {
    abrir()

    const grupo = await screen.findByRole('group', { name: 'Medio de pago' })
    expect(within(grupo).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Efectivo',
      'Transferencia bancaria',
      'Nequi',
      'Mixto',
    ])
    expect(within(grupo).getByLabelText('Efectivo')).toBeChecked()
  })

  it.each([
    ['Nequi', 'Pago por Nequi'],
    ['Transferencia bancaria', 'Pago por transferencia bancaria'],
  ])('con %s todo va como transferencia y el medio queda en las notas', async (medio, nota) => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta() }) })
    await agregar(u, 'pas')
    await elegirAna(u)

    await u.click(screen.getByLabelText(medio))
    expect(screen.queryByLabelText('Efectivo que entrega el cliente')).not.toBeInTheDocument()
    await u.type(screen.getByLabelText('Notas'), 'Cliente frecuente')
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(ventasEnviadas(api)[0]).toMatchObject({
      payments: [{ method: 'transfer', amount: 25000 }],
      notes: `${nota} · Cliente frecuente`,
    })
  })

  it('en el pago mixto se elige si la otra parte llega por Nequi', async () => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta() }) })
    await agregar(u, 'pas')
    await elegirAna(u)

    await u.click(screen.getByLabelText('Mixto'))
    await u.click(screen.getByLabelText('Nequi', { selector: '[name="canal-mixto"]' }))
    await u.type(screen.getByLabelText('Valor por Nequi'), '10000')
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await screen.findByRole('heading', { name: 'Venta registrada' })
    const enviada = ventasEnviadas(api)[0]
    expect(enviada.payments).toEqual([
      { method: 'cash', amount: 15000 },
      { method: 'transfer', amount: 10000 },
    ])
    expect(enviada.notes).toMatch(/^Parte por Nequi: \$\s?10\.000$/)
  })
})

describe('caja e inventario inicial', () => {
  it('con la caja cerrada avisa al vendedor y no deja cobrar', async () => {
    const { u } = abrir(vendedor, { 'GET /cash-sessions/current': () => ({ cuerpo: { is_open: false } }) })

    expect(await screen.findByText(/La caja está cerrada: no se puede vender\. Pídele al dueño que la abra\./)).toBeInTheDocument()
    await agregar(u, 'pas')
    await elegirAna(u)
    expect(screen.getByRole('button', { name: /^Cobrar/ })).toBeDisabled()
  })

  it('al dueño le ofrece abrir la caja', async () => {
    abrir(dueno, { 'GET /cash-sessions/current': () => ({ cuerpo: { is_open: false, session: null, suggested_opening_cash: 0 } }) })

    expect(await screen.findByRole('link', { name: 'Abrir la caja' })).toHaveAttribute('href', '/caja/actual')
  })

  it('si la caja se cerró mientras tanto (409), muestra el mensaje y vuelve a consultarla', async () => {
    const { api, u } = abrir(vendedor, {
      'POST /sales': () => errorDeApi(409, 'cash_session_closed', 'La caja está cerrada: ábrela para registrar dinero.'),
    })
    await agregar(u, 'pas')
    await elegirAna(u)
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La caja está cerrada: ábrela para registrar dinero.')
    await waitFor(() => expect(api.cuantas('GET /cash-sessions/current')).toBeGreaterThan(1))
  })

  it('mientras el inventario inicial siga abierto no se vende', async () => {
    abrir(vendedor, { 'GET /inventory/initial-count': () => ({ cuerpo: { ...conteoCerrado, is_open: true } }) })

    expect(await screen.findByText(/no se puede vender hasta que el dueño lo termine/)).toBeInTheDocument()
  })
})

describe('precio en la venta', () => {
  it('el dueño puede cambiar el precio y solo entonces se envía unit_price', async () => {
    const { api, u } = abrir(dueno, { 'POST /sales': () => ({ estado: 201, cuerpo: venta() }) })
    await agregar(u, 'pas')
    await agregar(u, 'fil')
    const precio = screen.getByLabelText('Precio de Pastillas de freno Pulsar 180')
    await u.clear(precio)
    await u.type(precio, '22000')
    expect(screen.getByText(/Catálogo \$\s?25\.000/)).toBeInTheDocument()
    await elegirAna(u)
    await u.click(screen.getByRole('button', { name: /^Cobrar/ }))

    await screen.findByRole('heading', { name: 'Venta registrada' })
    expect(ventasEnviadas(api)[0].items).toEqual([
      { product: 1, quantity: 1, unit_price: 22000 },
      { product: 4, quantity: 1 },
    ])
  })
})
