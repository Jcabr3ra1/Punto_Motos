import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InitialCountStatus } from '../../api/types'
import { dueno, errorDeApi, simularApi, type Respuesta } from '../../test/apiSimulada'
import { boxer, bosch, electrico, frenos, ngk, producto, pulsar } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const abierto: InitialCountStatus = { is_open: true, finished_at: null, finished_by: null, products_counted: 148, units_counted: 1320 }
const terminado: InitialCountStatus = {
  is_open: false,
  finished_at: '2026-11-01T09:30:00-05:00',
  finished_by: 'dueno',
  products_counted: 149,
  units_counted: 1332,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}, estadoInicial: InitialCountStatus = abierto) {
  let estado = estadoInicial
  const api = simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: estado }),
    'GET /catalog/categories': () => ({ cuerpo: [electrico, frenos] }),
    'GET /catalog/brands': () => ({ cuerpo: [bosch, ngk] }),
    'GET /catalog/motos': () => ({ cuerpo: [boxer, pulsar] }),
    'GET /products*': () => ({ cuerpo: { count: 0, next: null, previous: null, results: [] } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/inventario-inicial')
  return { api, u: userEvent.setup(), cambiarEstado: (nuevo: InitialCountStatus) => (estado = nuevo) }
}

async function llenar(u: ReturnType<typeof userEvent.setup>, cantidad: string | null = '12') {
  await u.type(await screen.findByLabelText('Nombre'), 'Bujía NGK C7HSA')
  await u.selectOptions(screen.getByLabelText('Tipo'), 'Eléctrico')
  await u.type(screen.getByLabelText('Costo'), '6000')
  await u.type(screen.getByLabelText('Precio de venta'), '9000')
  if (cantidad !== null) await u.type(screen.getByLabelText('Cantidad contada'), cantidad)
}

describe('cargar productos', () => {
  it('muestra el avance con separador de miles y el formulario con la cantidad contada', async () => {
    await abrir()

    expect(await screen.findByRole('heading', { name: 'Inventario inicial' })).toBeInTheDocument()
    const avance = await screen.findByLabelText('Avance del conteo')
    expect(avance).toHaveTextContent('Productos cargados148')
    expect(avance).toHaveTextContent('Unidades cargadas1.320')
    expect(await screen.findByLabelText('Cantidad contada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargar producto' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  it('carga el producto con su cantidad, actualiza el avance y deja el formulario listo para el siguiente', async () => {
    const { api, u, cambiarEstado } = await abrir({
      'POST /inventory/initial-count/items': () => ({ estado: 201, cuerpo: producto({ id: 9, code: 'ELE-UNI-BUJ', name: 'Bujía NGK C7HSA', stock: 12 }) }),
    })
    await llenar(u)
    cambiarEstado({ ...abierto, products_counted: 149, units_counted: 1332 })

    await u.click(screen.getByRole('button', { name: 'Cargar producto' }))

    expect(await screen.findByText('Producto «Bujía NGK C7HSA» cargado con 12 unidades. Código ELE-UNI-BUJ.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/initial-count/items')?.cuerpo).toMatchObject({
      name: 'Bujía NGK C7HSA',
      category: 2,
      cost_price: 6000,
      sale_price: 9000,
      quantity: 12,
    })
    expect(await screen.findByLabelText('Avance del conteo')).toHaveTextContent('Unidades cargadas1.332')
    // Listo para el siguiente: vacío y con el foco en el nombre.
    const nombre = screen.getByLabelText('Nombre')
    expect(nombre).toHaveValue('')
    expect(nombre).toHaveFocus()
    expect(screen.getByLabelText('Cantidad contada')).toHaveValue(null)
  })

  it('acepta cero unidades y lo envía como 0', async () => {
    const { api, u } = await abrir({
      'POST /inventory/initial-count/items': () => ({ estado: 201, cuerpo: producto({ stock: 0 }) }),
    })
    await llenar(u, '0')

    await u.click(screen.getByRole('button', { name: 'Cargar producto' }))

    await screen.findByText(/cargado con 0 unidades/)
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/initial-count/items')?.cuerpo).toMatchObject({ quantity: 0 })
  })

  it('usa el singular con una sola unidad', async () => {
    const { u } = await abrir({
      'POST /inventory/initial-count/items': () => ({ estado: 201, cuerpo: producto({ stock: 1 }) }),
    })
    await llenar(u, '1')

    await u.click(screen.getByRole('button', { name: 'Cargar producto' }))

    expect(await screen.findByText(/cargado con 1 unidad\./)).toBeInTheDocument()
  })

  it('sin cantidad no envía nada inventado: el error del backend sale junto al campo', async () => {
    const { api, u } = await abrir({
      'POST /inventory/initial-count/items': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { quantity: ['Este campo es requerido.'] }),
    })
    await llenar(u, null)

    await u.click(screen.getByRole('button', { name: 'Cargar producto' }))

    expect(await screen.findByText('Este campo es requerido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad contada')).toHaveAccessibleDescription(/requerido/)
    expect(api.llamadas.find((l) => l.clave === 'POST /inventory/initial-count/items')?.cuerpo).not.toHaveProperty('quantity')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Bujía NGK C7HSA')
  })

  it('si el conteo ya terminó, muestra el aviso del backend y pasa al resumen', async () => {
    const { u, cambiarEstado } = await abrir({
      'POST /inventory/initial-count/items': () =>
        errorDeApi(409, 'initial_count_finished', 'El inventario inicial ya terminó: usa compras o ajustes.'),
    })
    await llenar(u)
    cambiarEstado(terminado)

    await u.click(screen.getByRole('button', { name: 'Cargar producto' }))

    expect(await screen.findByText(/El inventario inicial ya terminó el/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Cantidad contada')).not.toBeInTheDocument()
  })
})

describe('terminar el conteo', () => {
  it('pide confirmación con los totales y advierte que no se puede deshacer', async () => {
    const { api, u } = await abrir()

    await u.click(await screen.findByRole('button', { name: 'Terminar conteo' }))

    const confirmacion = screen.getByRole('group', { name: '¿Terminar el inventario inicial?' })
    expect(confirmacion).toHaveTextContent('148 productos con 1.320 unidades')
    expect(confirmacion).toHaveTextContent('Esta acción no se puede deshacer.')
    expect(within(confirmacion).getByRole('button', { name: 'Seguir contando' })).toHaveFocus()
    expect(api.cuantas('POST /inventory/initial-count/finish')).toBe(0)
  })

  it('«Seguir contando» cierra la confirmación sin terminar nada', async () => {
    const { api, u } = await abrir()

    await u.click(await screen.findByRole('button', { name: 'Terminar conteo' }))
    await u.click(screen.getByRole('button', { name: 'Seguir contando' }))

    expect(screen.queryByRole('group', { name: '¿Terminar el inventario inicial?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminar conteo' })).toBeInTheDocument()
    expect(api.cuantas('POST /inventory/initial-count/finish')).toBe(0)
  })

  it('al confirmar termina el conteo, muestra el resumen y la entrada del menú desaparece', async () => {
    const { api, u } = await abrir({ 'POST /inventory/initial-count/finish': () => ({ cuerpo: terminado }) })
    const menu = await screen.findByRole('navigation', { name: 'Principal' })
    expect(await within(menu).findByRole('link', { name: 'Inventario inicial' })).toBeInTheDocument()

    await u.click(await screen.findByRole('button', { name: 'Terminar conteo' }))
    await u.click(screen.getByRole('button', { name: 'Sí, terminar el conteo' }))

    expect(await screen.findByText(/El inventario inicial ya terminó el/)).toHaveTextContent('lo terminó dueno')
    expect(screen.getByText(/Se cargaron 149 productos con 1\.332 unidades/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver los productos' })).toHaveAttribute('href', '/inventario/productos')
    expect(within(menu).queryByRole('link', { name: 'Inventario inicial' })).not.toBeInTheDocument()
    expect(api.cuantas('POST /inventory/initial-count/finish')).toBe(1)
  })

  it('envía una sola vez aunque se pulse varias veces', async () => {
    let terminar: (r: Respuesta) => void = () => {}
    const { api, u } = await abrir({
      'POST /inventory/initial-count/finish': () => new Promise<Respuesta>((resolver) => (terminar = resolver)),
    })

    await u.click(await screen.findByRole('button', { name: 'Terminar conteo' }))
    const confirmar = screen.getByRole('button', { name: 'Sí, terminar el conteo' })
    await u.dblClick(confirmar)
    await u.click(confirmar)

    expect(api.cuantas('POST /inventory/initial-count/finish')).toBe(1)
    expect(screen.getByRole('button', { name: 'Terminando…' })).toBeDisabled()
    await act(async () => terminar({ cuerpo: terminado }))
    expect(await screen.findByText(/El inventario inicial ya terminó el/)).toBeInTheDocument()
  })

  it('si falla, muestra el error y permite reintentar', async () => {
    const { u } = await abrir({
      'POST /inventory/initial-count/finish': () => errorDeApi(500, 'server_error', 'Fallo del programa.'),
    })

    await u.click(await screen.findByRole('button', { name: 'Terminar conteo' }))
    await u.click(screen.getByRole('button', { name: 'Sí, terminar el conteo' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    expect(screen.getByRole('button', { name: 'Sí, terminar el conteo' })).toBeEnabled()
  })

  it('si alguien más ya lo terminó, pasa al resumen', async () => {
    const { u, cambiarEstado } = await abrir({
      'POST /inventory/initial-count/finish': () =>
        errorDeApi(409, 'initial_count_finished', 'El inventario inicial ya terminó: usa compras o ajustes.'),
    })
    await u.click(await screen.findByRole('button', { name: 'Terminar conteo' }))
    cambiarEstado(terminado)

    await u.click(screen.getByRole('button', { name: 'Sí, terminar el conteo' }))

    expect(await screen.findByText(/El inventario inicial ya terminó el/)).toBeInTheDocument()
  })
})

describe('conteo ya terminado', () => {
  it('al entrar por la dirección muestra el resumen y no el formulario', async () => {
    await abrir({}, terminado)

    expect(await screen.findByText(/El inventario inicial ya terminó el/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Cantidad contada')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Terminar conteo' })).not.toBeInTheDocument()
  })

  it('avisa si no se pudo consultar el estado y permite reintentar', async () => {
    let intentos = 0
    const { u } = await abrir({
      'GET /inventory/initial-count': () =>
        ++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { cuerpo: abierto },
    })

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Fallo del programa.')
    await u.click(within(alerta).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByLabelText('Avance del conteo')).toBeInTheDocument()
  })
})
