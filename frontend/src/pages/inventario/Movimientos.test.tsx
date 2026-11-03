import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { movimiento, movimientoParaVendedor, paginaDeMovimientos, producto } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const entrada = movimiento({ id: 3, quantity: 5, balance_after: 8, reason: 'Conteo de bodega' })
const salida = movimiento({ id: 2, quantity: -2, balance_after: 3, reason: 'Se dañó en bodega', created_by: 'ana' })
const inicial = movimiento({ id: 1, kind: 'initial_count', kind_label: 'Inventario inicial', quantity: 5, balance_after: 5, reason: '' })

const pastillas = producto({ id: 1, stock: 8 })
const agotado = producto({ id: 7, code: 'ELE-UNI-BUJ', name: 'Bujía NGK C7HSA', stock: 0 })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(usuario: User, ruta = '/inventario/movimientos', rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /inventory/movements*': () => ({ cuerpo: paginaDeMovimientos([entrada, salida, inicial]) }),
    'GET /products/1': () => ({ cuerpo: pastillas }),
    'GET /catalog/search*': () => ({ cuerpo: [pastillas, agotado] }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: 'x', finished_by: 'dueno', products_counted: 1, units_counted: 1 } }),
    ...rutas,
  })
  mostrarRutas(usuario, ruta)
  return { api, u: userEvent.setup() }
}

const llamadas = (api: { llamadas: { clave: string }[] }, texto = '') =>
  api.llamadas.filter((l) => l.clave.startsWith('GET /inventory/movements') && l.clave.includes(texto))

describe('lista de movimientos', () => {
  it('el dueño ve fecha, producto, tipo, cantidad con signo, existencia que quedó, costo, motivo y autor', async () => {
    await abrir(dueno)

    const filaEntrada = (await screen.findByText('Conteo de bodega')).closest('tr')!
    expect(within(filaEntrada).getByText('Pastillas de freno Pulsar 180')).toBeInTheDocument()
    expect(within(filaEntrada).getByText('Ajuste')).toBeInTheDocument()
    expect(within(filaEntrada).getByText('+5')).toBeInTheDocument()
    expect(within(filaEntrada).getByText('8')).toBeInTheDocument()
    expect(filaEntrada).toHaveTextContent(/\$\s?18\.000/)

    const filaSalida = screen.getByText('Se dañó en bodega').closest('tr')!
    expect(within(filaSalida).getByText('-2')).toBeInTheDocument()
    expect(within(filaSalida).getByText('ana')).toBeInTheDocument()
    // Un movimiento sin motivo muestra una raya.
    expect(screen.getByText('Inventario inicial', { selector: 'td' }).closest('tr')).toHaveTextContent('—')
    expect(screen.getByText('3 movimientos')).toBeInTheDocument()
  })

  it('el vendedor consulta pero no ve el costo unitario ni puede ajustar', async () => {
    await abrir(vendedor, '/inventario/movimientos', {
      'GET /inventory/movements*': () => ({ cuerpo: paginaDeMovimientos([movimientoParaVendedor(entrada)]) }),
    })

    expect(await screen.findByText('Conteo de bodega')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Costo unitario' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\$\s?18\.000/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajustar existencia' })).not.toBeInTheDocument()
  })

  it('al entrar sin filtros pide todos los movimientos', async () => {
    const { api } = await abrir(dueno)

    await screen.findByRole('table')
    expect(llamadas(api).map((l) => l.clave)).toEqual(['GET /inventory/movements'])
  })

  it('avisa si no hay movimientos, con y sin filtros', async () => {
    const { u } = await abrir(dueno, '/inventario/movimientos', {
      'GET /inventory/movements*': () => ({ cuerpo: paginaDeMovimientos([]) }),
    })

    expect(await screen.findByText('Todavía no hay movimientos.')).toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Tipo'), 'Venta')
    expect(await screen.findByText('Ningún movimiento coincide con los filtros.')).toBeInTheDocument()
  })

  it('avisa si no se pudo cargar y permite reintentar', async () => {
    let intentos = 0
    const { u } = await abrir(dueno, '/inventario/movimientos', {
      'GET /inventory/movements*': () =>
        ++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { cuerpo: paginaDeMovimientos([entrada]) },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('muestra el error del campo cuando el backend rechaza un filtro', async () => {
    await abrir(dueno, '/inventario/movimientos?kind=robo', {
      'GET /inventory/movements*': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { kind: ['Elige una opción válida.'] }),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Elige una opción válida.')
  })
})

describe('filtros', () => {
  it('ofrece los tipos de consignación', async () => {
    const { api, u } = await abrir(dueno)
    await screen.findByRole('table')

    await u.selectOptions(screen.getByLabelText('Tipo'), 'Entrega en consignación')

    await waitFor(() => expect(llamadas(api, 'kind=consignment_out')).toHaveLength(1))
    expect(screen.getByRole('option', { name: 'Devolución de consignación' })).toBeInTheDocument()
  })

  it('filtra por tipo', async () => {
    const { api, u } = await abrir(dueno)
    await screen.findByRole('table')

    await u.selectOptions(screen.getByLabelText('Tipo'), 'Ajuste')

    await waitFor(() => expect(llamadas(api, 'kind=adjustment')).toHaveLength(1))
  })

  it('filtra por fechas, ambas incluidas', async () => {
    const { api } = await abrir(dueno)
    await screen.findByRole('table')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-30' } })

    await waitFor(() => expect(llamadas(api, 'date_from=2026-11-01&date_to=2026-11-30')).toHaveLength(1))
  })

  it('al abrir el kárdex de un producto muestra qué producto es y permite quitar el filtro', async () => {
    const { api, u } = await abrir(dueno, '/inventario/movimientos?product=1')

    expect(await screen.findByText('Pastillas de freno Pulsar 180', { selector: '.filtro-de-producto *' })).toBeInTheDocument()
    expect(llamadas(api, 'product=1')).not.toHaveLength(0)

    await u.click(screen.getByRole('button', { name: 'Quitar filtro' }))

    expect(await screen.findByRole('combobox', { name: 'Filtrar por producto' })).toBeInTheDocument()
    expect(llamadas(api).some((l) => l.clave === 'GET /inventory/movements')).toBe(true)
  })

  it('elige el producto con el buscador, incluso uno sin existencias', async () => {
    const { api, u } = await abrir(dueno, '/inventario/movimientos', {
      'GET /products/7': () => ({ cuerpo: agotado }),
    })
    await screen.findByRole('table')

    await u.type(screen.getByRole('combobox', { name: 'Filtrar por producto' }), 'buj')
    const opcion = await screen.findByRole('option', { name: /ELE-UNI-BUJ/ })
    expect(opcion).not.toHaveAttribute('aria-disabled')
    await u.click(opcion)

    await waitFor(() => expect(llamadas(api, 'product=7')).not.toHaveLength(0))
    expect(await screen.findByRole('button', { name: 'Quitar filtro' })).toBeInTheDocument()
  })

  it('cambia de página y vuelve a la primera al cambiar un filtro', async () => {
    const { api, u } = await abrir(dueno, '/inventario/movimientos', {
      'GET /inventory/movements*': (_, ruta) =>
        ruta.includes('page=2')
          ? { cuerpo: paginaDeMovimientos([salida], { count: 120, previous: 'x', next: 'y' }) }
          : { cuerpo: paginaDeMovimientos([entrada], { count: 120, next: 'y' }) },
    })

    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
    expect(llamadas(api, 'page=2')).toHaveLength(1)

    await u.selectOptions(screen.getByLabelText('Tipo'), 'Venta')
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
  })
})

describe('ajustar existencia', () => {
  async function abrirAjuste(rutas: Parameters<typeof simularApi>[0] = {}, ruta = '/inventario/movimientos') {
    const resultado = await abrir(dueno, ruta, rutas)
    await screen.findByRole('table')
    await resultado.u.click(screen.getByRole('button', { name: 'Ajustar existencia' }))
    return resultado
  }

  it('resta unidades enviando la cantidad con signo negativo y confirma la existencia que quedó', async () => {
    const { api, u } = await abrirAjuste({
      'POST /inventory/adjustments': () => ({ estado: 201, cuerpo: movimiento({ quantity: -1, balance_after: 7 }) }),
    })

    await u.type(screen.getByRole('combobox', { name: 'Producto' }), 'pas')
    await u.click(await screen.findByRole('option', { name: /FRE-PUL-PAS/ }))
    expect(screen.getByText('Existencia actual: 8')).toBeInTheDocument()
    await u.click(screen.getByLabelText('Salen unidades (resta)'))
    await u.type(screen.getByLabelText('Cantidad'), '1')
    await u.type(screen.getByLabelText('Motivo'), 'Se dañó en bodega')
    await u.click(screen.getByRole('button', { name: 'Guardar ajuste' }))

    expect(await screen.findByText('Ajuste guardado: «Pastillas de freno Pulsar 180» ahora tiene 7 unidades.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/adjustments')?.cuerpo).toEqual({
      product: 1,
      quantity: -1,
      reason: 'Se dañó en bodega',
    })
    // Vuelve a la lista de movimientos.
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('suma unidades con cantidad positiva', async () => {
    const { api, u } = await abrirAjuste({
      'POST /inventory/adjustments': () => ({ estado: 201, cuerpo: movimiento({ quantity: 4, balance_after: 12 }) }),
    })

    await u.type(screen.getByRole('combobox', { name: 'Producto' }), 'pas')
    await u.click(await screen.findByRole('option', { name: /FRE-PUL-PAS/ }))
    await u.type(screen.getByLabelText('Cantidad'), '4')
    await u.type(screen.getByLabelText('Motivo'), 'Conteo de bodega')
    await u.click(screen.getByRole('button', { name: 'Guardar ajuste' }))

    await screen.findByText(/Ajuste guardado/)
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/adjustments')?.cuerpo).toMatchObject({ quantity: 4 })
  })

  it('si se está viendo el kárdex de un producto, ya viene elegido', async () => {
    const { u } = await abrirAjuste({}, '/inventario/movimientos?product=1')
    void u

    expect(await screen.findByText('Existencia actual: 8')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Producto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar' })).not.toBeInTheDocument()
  })

  it('muestra el error de cantidad y de motivo junto a cada campo y conserva lo escrito', async () => {
    const { u } = await abrirAjuste(
      {
        'POST /inventory/adjustments': () =>
          errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
            quantity: ['Solo hay 8 unidades: no se pueden restar 9.'],
            reason: ['Este campo no puede estar en blanco.'],
          }),
      },
      '/inventario/movimientos?product=1',
    )

    await screen.findByText('Existencia actual: 8')
    await u.click(screen.getByLabelText('Salen unidades (resta)'))
    await u.type(screen.getByLabelText('Cantidad'), '9')
    await u.click(screen.getByRole('button', { name: 'Guardar ajuste' }))

    expect(await screen.findByText('Solo hay 8 unidades: no se pueden restar 9.')).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad')).toHaveAccessibleDescription(/Solo hay 8/)
    expect(screen.getByLabelText('Motivo')).toHaveAccessibleDescription(/en blanco/)
    expect(screen.getByLabelText('Cantidad')).toHaveValue(9)
    expect(screen.getByLabelText('Salen unidades (resta)')).toBeChecked()
  })

  it('no envía una cantidad vacía como cero: deja que el backend la pida', async () => {
    const { api, u } = await abrirAjuste(
      {
        'POST /inventory/adjustments': () =>
          errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { quantity: ['Este campo es requerido.'] }),
      },
      '/inventario/movimientos?product=1',
    )

    await screen.findByText('Existencia actual: 8')
    await u.type(screen.getByLabelText('Motivo'), 'Prueba')
    await u.click(screen.getByRole('button', { name: 'Guardar ajuste' }))

    expect(await screen.findByText('Este campo es requerido.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/adjustments')?.cuerpo).not.toHaveProperty('quantity')
  })

  it('cancelar vuelve a la lista sin enviar nada', async () => {
    const { api, u } = await abrirAjuste()

    await u.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(api.cuantas('POST /inventory/adjustments')).toBe(0)
  })
})
