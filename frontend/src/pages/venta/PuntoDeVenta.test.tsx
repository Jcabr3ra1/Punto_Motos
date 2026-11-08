import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { mecanico, paginaDe, producto, tipoDeServicio, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const pastillas = producto({ id: 1, sale_price: 25000, stock: 3 })
const conteoCerrado = { is_open: false, finished_at: 'x', finished_by: 'dueno', products_counted: 1, units_counted: 1 }

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

function abrir(usuario = vendedor, rutas: Parameters<typeof simularApi>[0] = {}, ruta = '/venta/vender') {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true } }),
    'GET /inventory/initial-count': () => ({ cuerpo: conteoCerrado }),
    'GET /catalog/search*': () => ({ cuerpo: [pastillas] }),
    'GET /customers*': () => ({ cuerpo: paginaDe([]) }),
    'GET /service-types*': () => ({ cuerpo: [tipoDeServicio()] }),
    'GET /mechanics*': () => ({ cuerpo: [mecanico()] }),
    'GET /sales*': () => ({ cuerpo: paginaDe([]) }),
    ...rutas,
  })
  mostrarRutas(usuario, ruta)
  return { api, u: userEvent.setup() }
}

async function agregarPastillas(u: ReturnType<typeof userEvent.setup>) {
  await u.type(await screen.findByRole('combobox', { name: 'Buscar producto o servicio' }), 'pas')
  await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(true))
  await u.keyboard('{Enter}')
}

describe('punto de venta', () => {
  it('los botones − y + cambian la cantidad sin pasar la existencia', async () => {
    const { u } = abrir()
    await agregarPastillas(u)
    const cantidad = screen.getByLabelText('Cantidad de Pastillas de freno Pulsar 180')

    await u.click(screen.getByRole('button', { name: 'Una unidad más de Pastillas de freno Pulsar 180' }))
    await u.click(screen.getByRole('button', { name: 'Una unidad más de Pastillas de freno Pulsar 180' }))
    expect(cantidad).toHaveValue(3)
    expect(screen.getByRole('button', { name: 'Una unidad más de Pastillas de freno Pulsar 180' })).toBeDisabled()

    await u.click(screen.getByRole('button', { name: 'Una unidad menos de Pastillas de freno Pulsar 180' }))
    expect(cantidad).toHaveValue(2)
  })

  it('los billetes rápidos llenan lo que entrega el cliente y muestran el vuelto', async () => {
    const { u } = abrir()
    await agregarPastillas(u)

    await u.click(screen.getByRole('button', { name: /^\$\s?50\.000$/ }))
    expect(screen.getByLabelText('Efectivo que entrega el cliente')).toHaveValue(50000)
    expect(screen.getByText(/Vuelto:/)).toHaveTextContent(/\$\s?25\.000/)

    await u.click(screen.getByRole('button', { name: 'Exacto' }))
    expect(screen.getByLabelText('Efectivo que entrega el cliente')).toHaveValue(25000)
  })

  it('un servicio del taller se agrega con un clic en su botón', async () => {
    const { u } = abrir()

    await u.click(await screen.findByRole('button', { name: /^Agregar 101 · Cambio de aceite/ }))

    expect(screen.getByRole('row', { name: /Cambio de aceite/ })).toBeInTheDocument()
  })

  it('F2 lleva el foco al buscador', async () => {
    const { u } = abrir()
    const buscador = await screen.findByRole('combobox', { name: 'Buscar producto o servicio' })
    screen.getByLabelText('Notas').focus()

    await u.keyboard('{F2}')

    expect(buscador).toHaveFocus()
  })

  it('Ctrl+Enter cobra cuando la venta está lista', async () => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta({ total: 25000 }) }) })
    await agregarPastillas(u)

    await u.keyboard('{Control>}{Enter}{/Control}')

    expect(await screen.findByRole('heading', { name: 'Venta registrada' })).toBeInTheDocument()
    expect(api.llamadas.filter((l) => l.clave === 'POST /sales')).toHaveLength(1)
  })

  it('el total y el cobro están en la caja registradora', async () => {
    abrir(dueno)

    const caja = await screen.findByRole('region', { name: 'Cobro' })
    expect(within(caja).getByLabelText('Total de la venta')).toBeInTheDocument()
    expect(within(caja).getByRole('button', { name: /^Cobrar/ })).toBeInTheDocument()
  })

  it('al entrar a Vender el menú se recoge solo y al salir vuelve como estaba', async () => {
    const { u } = abrir(dueno, {}, '/venta/vender')

    await waitFor(() => expect(document.querySelector('.menu-lateral--recogido')).not.toBeNull())
    expect(localStorage.getItem('puntomoto.menuRecogido')).toBeNull()

    await u.click(screen.getByRole('button', { name: 'Inventario' }))

    await waitFor(() => expect(document.querySelector('.menu-lateral--recogido')).toBeNull())
  })

  it('en el pago mixto se ven las dos partes y al escribir una se calcula la otra', async () => {
    const { u } = abrir()
    await agregarPastillas(u)
    await u.click(screen.getByLabelText('Mixto'))

    await u.type(screen.getByLabelText('En efectivo'), '10000')
    expect(screen.getByLabelText('Valor por transferencia')).toHaveValue(15000)

    await u.clear(screen.getByLabelText('Valor por transferencia'))
    await u.type(screen.getByLabelText('Valor por transferencia'), '5000')
    expect(screen.getByLabelText('En efectivo')).toHaveValue(20000)
  })

  it('el cliente dice que es opcional', async () => {
    abrir()

    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveAttribute('placeholder', expect.stringMatching(/opcional/i))
    expect(screen.getByText('Opcional')).toBeInTheDocument()
  })

  it('Ctrl+Enter con resultados abiertos cobra sin agregar otra unidad', async () => {
    const { api, u } = abrir(vendedor, { 'POST /sales': () => ({ estado: 201, cuerpo: venta({ total: 25000 }) }) })
    await agregarPastillas(u)
    await u.type(screen.getByRole('combobox', { name: 'Buscar producto o servicio' }), 'pas')
    await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(true))

    await u.keyboard('{Control>}{Enter}{/Control}')

    await screen.findByRole('heading', { name: 'Venta registrada' })
    const [enviada] = api.llamadas.filter((l) => l.clave === 'POST /sales').map((l) => l.cuerpo as { items: { quantity: number }[] })
    expect(enviada.items).toEqual([{ product: 1, quantity: 1 }])
  })
})
