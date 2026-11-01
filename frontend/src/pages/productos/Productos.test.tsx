import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { boxer, bosch, electrico, frenos, ngk, pagina, paraVendedor, producto, pulsar } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const bujia = producto({
  id: 2,
  code: 'ELE-UNI-BUJ',
  name: 'Bujía NGK C7HSA',
  category: electrico,
  brand: ngk,
  moto: null,
  compatible_motos: [],
  is_universal: true,
  cost_price: 6000,
  sale_price: 5000,
  sells_below_cost: true,
  stock: 0,
  min_stock: 0,
  is_low_stock: true,
})
const pastillas = producto()

const catalogos = {
  'GET /catalog/categories': () => ({ cuerpo: [electrico, frenos] }),
  'GET /catalog/brands': () => ({ cuerpo: [bosch, ngk] }),
  'GET /catalog/motos': () => ({ cuerpo: [boxer, pulsar] }),
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(usuario: User, rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    ...catalogos,
    'GET /products*': () => ({ cuerpo: pagina([bujia, pastillas]) }),
    ...rutas,
  })
  mostrarRutas(usuario, '/productos')
  await screen.findByRole('table')
  return { api, u: userEvent.setup() }
}

const llamadasA = (api: { llamadas: { clave: string }[] }, texto: string) =>
  api.llamadas.filter((l) => l.clave.startsWith('GET /products') && l.clave.includes(texto))

describe('lista de productos', () => {
  it('el dueño ve código, costo, precio y existencia con pesos colombianos', async () => {
    await abrir(dueno)

    const fila = screen.getByText('FRE-PUL-PAS').closest('tr')!
    expect(within(fila).getByText('Pastillas de freno Pulsar 180')).toBeInTheDocument()
    expect(within(fila).getByText(/Bosch · Pulsar 180/)).toBeInTheDocument()
    expect(fila).toHaveTextContent(/\$\s?18\.000/)
    expect(fila).toHaveTextContent(/\$\s?25\.000/)
    expect(screen.getByRole('columnheader', { name: 'Costo' })).toBeInTheDocument()
  })

  it('el vendedor no ve el costo, ni los botones de crear y editar', async () => {
    await abrir(vendedor, { 'GET /products*': () => ({ cuerpo: pagina([paraVendedor(bujia), paraVendedor(pastillas)]) }) })

    expect(screen.queryByRole('columnheader', { name: 'Costo' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\$\s?18\.000/)).not.toBeInTheDocument()
    expect(screen.queryByText('Bajo el costo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo producto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Mostrar desactivados')).not.toBeInTheDocument()
    expect(screen.getByText('FRE-PUL-PAS')).toBeInTheDocument()
  })

  it('marca los productos que hay que reponer y los que se venden bajo el costo', async () => {
    await abrir(dueno)

    const filaBujia = screen.getByText('ELE-UNI-BUJ').closest('tr')!
    expect(within(filaBujia).getByText('Reponer')).toBeInTheDocument()
    expect(within(filaBujia).getByText('Bajo el costo')).toBeInTheDocument()
    expect(within(filaBujia).getByText('Universal', { exact: false })).toBeInTheDocument()

    const filaPastillas = screen.getByText('FRE-PUL-PAS').closest('tr')!
    expect(within(filaPastillas).queryByText('Reponer')).not.toBeInTheDocument()
  })

  it('avisa si no hay productos', async () => {
    simularApi({ ...catalogos, 'GET /products*': () => ({ cuerpo: pagina([]) }) })
    mostrarRutas(dueno, '/productos')

    expect(await screen.findByText(/Todavía no hay productos/)).toBeInTheDocument()
  })

  it('avisa si no se pudo cargar y permite reintentar', async () => {
    let intentos = 0
    simularApi({
      ...catalogos,
      'GET /products*': () =>
        ++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { cuerpo: pagina([pastillas]) },
    })
    mostrarRutas(dueno, '/productos')
    const u = userEvent.setup()

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})

describe('filtros y paginación', () => {
  it('busca con una pausa corta: una sola llamada aunque se escriba rápido', async () => {
    const { api, u } = await abrir(dueno)

    await u.type(screen.getByLabelText('Buscar'), 'bujia')

    await waitFor(() => expect(llamadasA(api, 'q=bujia')).toHaveLength(1))
    expect(llamadasA(api, 'q=')).toHaveLength(1)
  })

  it('al filtrar por tipo pide solo ese tipo', async () => {
    const { api, u } = await abrir(dueno)

    await u.selectOptions(screen.getByLabelText('Tipo'), 'Frenos')

    await waitFor(() => expect(llamadasA(api, 'category=1')).not.toHaveLength(0))
  })

  it('filtra por moto e insumos de taller', async () => {
    const { api, u } = await abrir(dueno)

    await u.selectOptions(screen.getByLabelText('Moto'), 'Pulsar 180')
    await u.click(screen.getByLabelText('Solo insumos de taller'))

    await waitFor(() => expect(llamadasA(api, 'workshop_supply=true')).not.toHaveLength(0))
    expect(llamadasA(api, 'moto=1&workshop_supply=true')).not.toHaveLength(0)
  })

  it('el dueño puede mostrar los desactivados', async () => {
    const { api, u } = await abrir(dueno)

    await u.click(screen.getByLabelText('Mostrar desactivados'))

    await waitFor(() => expect(llamadasA(api, 'include_inactive=true')).not.toHaveLength(0))
  })

  it('cambia de página y vuelve a la primera al cambiar un filtro', async () => {
    const { api, u } = await abrir(dueno, {
      'GET /products*': (_, ruta) =>
        ruta.includes('page=2')
          ? { cuerpo: pagina([bujia], { count: 120, previous: 'x', next: 'y' }) }
          : { cuerpo: pagina([pastillas], { count: 120, next: 'y' }) },
    })

    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await u.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
    expect(llamadasA(api, 'page=2')).toHaveLength(1)

    await u.selectOptions(screen.getByLabelText('Tipo'), 'Frenos')
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
  })

  it('no muestra los botones de página cuando todo cabe en una sola', async () => {
    await abrir(dueno)

    expect(screen.queryByRole('navigation', { name: 'Páginas de productos' })).not.toBeInTheDocument()
  })

  it('avisa cuando ningún producto coincide con la búsqueda', async () => {
    const { u } = await abrir(dueno, {
      'GET /products*': (_, ruta) => ({ cuerpo: pagina(ruta.includes('q=') ? [] : [pastillas]) }),
    })

    await u.type(screen.getByLabelText('Buscar'), 'zzz')

    expect(await screen.findByText('Ningún producto coincide con la búsqueda.')).toBeInTheDocument()
  })
})

describe('crear producto', () => {
  async function abrirFormulario(rutas: Parameters<typeof simularApi>[0] = {}) {
    const resultado = await abrir(dueno, rutas)
    await resultado.u.click(screen.getByRole('button', { name: 'Nuevo producto' }))
    await screen.findByLabelText('Nombre')
    return resultado
  }

  it('sugiere el código mientras se escribe y permite usarlo', async () => {
    const { api, u } = await abrirFormulario({
      'GET /catalog/code-suggestion*': () => ({ cuerpo: { code: 'FRE-PUL-PAS' } }),
      'POST /products': () => ({ estado: 201, cuerpo: pastillas }),
    })

    await u.selectOptions(screen.getByLabelText('Tipo'), 'Frenos')
    await u.selectOptions(screen.getByLabelText('Moto'), 'Pulsar 180')
    await u.type(screen.getByLabelText('Nombre'), 'Pastillas de freno')

    expect(await screen.findByText('FRE-PUL-PAS')).toBeInTheDocument()
    // La pausa evita pedir la sugerencia con cada tecla.
    expect(api.llamadas.filter((l) => l.clave.startsWith('GET /catalog/code-suggestion'))).toHaveLength(1)
    expect(api.llamadas.some((l) => l.clave === 'GET /catalog/code-suggestion?category=1&name=Pastillas+de+freno&moto=1')).toBe(true)

    await u.click(screen.getByRole('button', { name: 'Usar este código' }))
    expect(screen.getByLabelText('Código interno')).toHaveValue('FRE-PUL-PAS')
  })

  it('crea el producto con ids y precios enteros, y confirma el código generado', async () => {
    const { api, u } = await abrirFormulario({
      'POST /products': () => ({ estado: 201, cuerpo: pastillas }),
    })

    await u.type(screen.getByLabelText('Nombre'), 'Pastillas de freno Pulsar 180')
    await u.selectOptions(screen.getByLabelText('Tipo'), 'Frenos')
    await u.selectOptions(screen.getByLabelText('Marca'), 'Bosch')
    await u.selectOptions(screen.getByLabelText('Moto'), 'Pulsar 180')
    await u.click(screen.getByLabelText('Boxer CT 100'))
    await u.type(screen.getByLabelText('Costo'), '18000')
    await u.type(screen.getByLabelText('Precio de venta'), '25000')
    await u.type(screen.getByLabelText('Ubicación'), 'Estante B2')
    await u.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('Producto «Pastillas de freno Pulsar 180» creado con el código FRE-PUL-PAS.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /products')?.cuerpo).toEqual({
      name: 'Pastillas de freno Pulsar 180',
      category: 1,
      brand: 2,
      moto: 1,
      compatible_motos: [2],
      cost_price: 18000,
      sale_price: 25000,
      min_stock: 0,
      location: 'Estante B2',
      is_workshop_supply: false,
      is_active: true,
    })
    // Sin código escrito no se envía: el backend lo genera.
    expect(api.llamadas.find((l) => l.clave === 'POST /products')?.cuerpo).not.toHaveProperty('code')
  })

  it('la moto principal desaparece de las compatibles', async () => {
    const { u } = await abrirFormulario()

    expect(screen.getByLabelText('Pulsar 180', { selector: 'input[type=checkbox]' })).toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Moto'), 'Pulsar 180')

    expect(screen.queryByLabelText('Pulsar 180', { selector: 'input[type=checkbox]' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Boxer CT 100')).toBeInTheDocument()
  })

  it('avisa mientras se escribe si el precio es menor que el costo, sin impedir guardar', async () => {
    const { u } = await abrirFormulario()

    await u.type(screen.getByLabelText('Costo'), '6000')
    await u.type(screen.getByLabelText('Precio de venta'), '5000')

    expect(screen.getByText(/El precio de venta es menor que el costo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear producto' })).toBeEnabled()
  })

  it('al guardar usa lo que confirma el backend para avisar que se vende bajo el costo', async () => {
    const { u } = await abrirFormulario({ 'POST /products': () => ({ estado: 201, cuerpo: bujia }) })

    await u.type(screen.getByLabelText('Nombre'), 'Bujía NGK C7HSA')
    await u.selectOptions(screen.getByLabelText('Tipo'), 'Eléctrico')
    await u.type(screen.getByLabelText('Costo'), '6000')
    await u.type(screen.getByLabelText('Precio de venta'), '5000')
    await u.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText(/Atención: se vende por debajo del costo\./)).toBeInTheDocument()
  })

  it('muestra los errores junto a cada campo y conserva lo escrito', async () => {
    const { u } = await abrirFormulario({
      'POST /products': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          code: ['Ya existe un producto con ese código.'],
          sale_price: ['El precio de venta debe ser mayor que cero.'],
        }),
    })

    await u.type(screen.getByLabelText('Nombre'), 'Pastillas de freno')
    await u.selectOptions(screen.getByLabelText('Tipo'), 'Frenos')
    await u.type(screen.getByLabelText('Código interno'), 'FRE-PUL-PAS')
    await u.type(screen.getByLabelText('Costo'), '1000')
    await u.type(screen.getByLabelText('Precio de venta'), '0')
    await u.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('Ya existe un producto con ese código.')).toBeInTheDocument()
    expect(screen.getByLabelText('Código interno')).toHaveAccessibleDescription(/Ya existe/)
    expect(screen.getByLabelText('Precio de venta')).toHaveAccessibleDescription(/mayor que cero/)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pastillas de freno')
  })

  it('no envía precios vacíos como cero: deja que el backend los pida', async () => {
    const { api, u } = await abrirFormulario({
      'POST /products': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          cost_price: ['Este campo es requerido.'],
        }),
    })

    await u.type(screen.getByLabelText('Nombre'), 'Algo')
    await u.click(screen.getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('Este campo es requerido.')).toBeInTheDocument()
    const cuerpo = api.llamadas.find((l) => l.clave === 'POST /products')?.cuerpo
    expect(cuerpo).not.toHaveProperty('cost_price')
    expect(cuerpo).not.toHaveProperty('sale_price')
  })

  it('cancelar vuelve a la lista sin enviar nada', async () => {
    const { api, u } = await abrirFormulario()

    await u.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(api.cuantas('POST /products')).toBe(0)
  })
})

describe('editar producto', () => {
  it('carga los datos, muestra la existencia sin permitir editarla y guarda los cambios', async () => {
    const { api, u } = await abrir(dueno, {
      'PATCH /products/1': () => ({ cuerpo: { ...pastillas, sale_price: 27000 } }),
    })

    await u.click(screen.getByRole('button', { name: 'Editar Pastillas de freno Pulsar 180' }))

    expect(await screen.findByLabelText('Código interno')).toHaveValue('FRE-PUL-PAS')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pastillas de freno Pulsar 180')
    expect(screen.getByLabelText('Costo')).toHaveValue(18000)
    expect(screen.getByText(/Existencia actual:/)).toHaveTextContent('Existencia actual: 5')
    expect(screen.queryByLabelText(/^Existencia$/)).not.toBeInTheDocument()

    await u.clear(screen.getByLabelText('Precio de venta'))
    await u.type(screen.getByLabelText('Precio de venta'), '27000')
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Cambios de «Pastillas de freno Pulsar 180» guardados.')).toBeInTheDocument()
    const cuerpo = api.llamadas.find((l) => l.clave === 'PATCH /products/1')?.cuerpo
    expect(cuerpo).toMatchObject({ sale_price: 27000, cost_price: 18000, code: 'FRE-PUL-PAS', category: 1, brand: 2, moto: 1 })
    expect(cuerpo).not.toHaveProperty('stock')
    // Al editar no se pide sugerencia de código.
    expect(api.llamadas.some((l) => l.clave.startsWith('GET /catalog/code-suggestion'))).toBe(false)
  })

  it('muestra la marca actual aunque se haya desactivado después, en lugar de «Sin marca»', async () => {
    const marcaVieja = { ...bosch, is_active: false }
    const { u } = await abrir(dueno, {
      'GET /products*': () => ({ cuerpo: pagina([producto({ brand: marcaVieja })]) }),
      // Las marcas activas ya no incluyen a Bosch.
      'GET /catalog/brands': () => ({ cuerpo: [ngk] }),
    })

    await u.click(screen.getByRole('button', { name: 'Editar Pastillas de freno Pulsar 180' }))

    const marca = await screen.findByLabelText('Marca')
    expect(marca).toHaveValue('2')
    expect(within(marca).getByRole('option', { name: 'Bosch (desactivado)' })).toBeInTheDocument()
  })

  it('permite desactivar el producto', async () => {
    const { api, u } = await abrir(dueno, {
      'PATCH /products/1': () => ({ cuerpo: { ...pastillas, is_active: false } }),
    })

    await u.click(screen.getByRole('button', { name: 'Editar Pastillas de freno Pulsar 180' }))
    await u.click(await screen.findByLabelText('Producto activo'))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText(/Cambios de/)
    expect(api.llamadas.find((l) => l.clave === 'PATCH /products/1')?.cuerpo).toMatchObject({ is_active: false })
  })
})
