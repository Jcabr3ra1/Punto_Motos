import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi, vendedor } from '../../../test/apiSimulada'
import { boxer, bosch, electrico, frenos, ngk, pulsar } from '../../../test/datos'
import { mostrarRutas } from '../../../test/mostrar'

const motoInactiva = { id: 9, name: 'Discover 125', abbreviation: 'DIS', is_active: false }

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /catalog/categories?include_inactive=true': () => ({ cuerpo: [electrico, frenos] }),
    'GET /catalog/brands?include_inactive=true': () => ({ cuerpo: [bosch, ngk] }),
    'GET /catalog/motos?include_inactive=true': () => ({ cuerpo: [boxer, motoInactiva, pulsar] }),
    ...rutas,
  })
  mostrarRutas(dueno, '/configuracion/catalogo')
  await screen.findByRole('table')
  return { api, u: userEvent.setup() }
}

describe('lista de tipos, marcas y motos', () => {
  it('empieza por los tipos y muestra su sigla', async () => {
    await abrir()

    const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(2)
    expect(within(filas[0]).getByText('Eléctrico')).toBeInTheDocument()
    expect(within(filas[0]).getByText('ELE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tipos' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('las marcas no tienen sigla', async () => {
    const { u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Marcas' }))

    expect(await screen.findByText('NGK')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Sigla' })).not.toBeInTheDocument()
  })

  it('las motos muestran también las desactivadas', async () => {
    const { u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Motos' }))

    const fila = (await screen.findByText('Discover 125')).closest('tr')!
    expect(within(fila).getByText('Inactivo')).toBeInTheDocument()
  })

  it('avisa si no se pudo cargar y permite reintentar', async () => {
    let intentos = 0
    simularApi({
      'GET /catalog/categories?include_inactive=true': () =>
        ++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { cuerpo: [frenos] },
    })
    mostrarRutas(dueno, '/configuracion/catalogo')
    const u = userEvent.setup()

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})

describe('crear', () => {
  it('crea un tipo con su sigla y vuelve a la lista actualizada', async () => {
    let tipos = [electrico, frenos]
    const nuevo = { id: 3, name: 'Llantas', abbreviation: 'LL', is_active: true }
    const { api, u } = await abrir({
      'GET /catalog/categories?include_inactive=true': () => ({ cuerpo: tipos }),
      'POST /catalog/categories': () => {
        tipos = [...tipos, nuevo]
        return { estado: 201, cuerpo: nuevo }
      },
    })

    await u.click(screen.getByRole('button', { name: 'Nuevo tipo' }))
    await u.type(screen.getByLabelText('Nombre'), 'Llantas')
    await u.type(screen.getByLabelText('Sigla'), 'll')
    await u.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Tipo «Llantas» creado.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /catalog/categories')?.cuerpo).toEqual({
      name: 'Llantas',
      abbreviation: 'll',
    })
    expect(within(screen.getByRole('table')).getByText('Llantas')).toBeInTheDocument()
  })

  it('una marca se crea solo con el nombre', async () => {
    const { api, u } = await abrir({
      'POST /catalog/brands': () => ({ estado: 201, cuerpo: { id: 3, name: 'Yamaha', is_active: true } }),
    })

    await u.click(screen.getByRole('button', { name: 'Marcas' }))
    await u.click(await screen.findByRole('button', { name: 'Nueva marca' }))
    expect(screen.queryByLabelText('Sigla')).not.toBeInTheDocument()
    await u.type(screen.getByLabelText('Nombre'), 'Yamaha')
    await u.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Marca «Yamaha» creada.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /catalog/brands')?.cuerpo).toEqual({ name: 'Yamaha' })
  })

  it('muestra el error de la sigla junto al campo', async () => {
    const { u } = await abrir({
      'POST /catalog/categories': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          abbreviation: ['Ya existe un tipo con esa sigla.'],
        }),
    })

    await u.click(screen.getByRole('button', { name: 'Nuevo tipo' }))
    await u.type(screen.getByLabelText('Nombre'), 'Frenos 2')
    await u.type(screen.getByLabelText('Sigla'), 'fre')
    await u.click(screen.getByRole('button', { name: 'Crear' }))

    expect(await screen.findByText('Ya existe un tipo con esa sigla.')).toBeInTheDocument()
    expect(screen.getByLabelText('Sigla')).toHaveAccessibleDescription(/Ya existe/)
    expect(screen.getByLabelText('Nombre')).toHaveValue('Frenos 2')
  })

  it('cancelar vuelve a la lista sin enviar nada', async () => {
    const { api, u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Nuevo tipo' }))
    await u.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(api.cuantas('POST /catalog/categories')).toBe(0)
  })
})

describe('siglas', () => {
  it('admiten hasta 8 letras', async () => {
    const { u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Nuevo tipo' }))

    expect(screen.getByLabelText('Sigla')).toHaveAttribute('maxLength', '8')
    expect(screen.getByLabelText('Sigla')).toHaveAccessibleDescription(/De 2 a 8 letras/)
  })
})

describe('editar', () => {
  it('desactiva una moto', async () => {
    const { api, u } = await abrir({
      'PATCH /catalog/motos/1': () => ({ cuerpo: { ...pulsar, is_active: false } }),
    })

    await u.click(screen.getByRole('button', { name: 'Motos' }))
    await u.click(await screen.findByRole('button', { name: 'Editar «Pulsar 180»' }))
    await u.click(screen.getByLabelText('Activo'))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Cambios de «Pulsar 180» guardados.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'PATCH /catalog/motos/1')?.cuerpo).toEqual({
      name: 'Pulsar 180',
      abbreviation: 'PUL',
      is_active: false,
    })
  })
})

describe('permisos', () => {
  it('el vendedor no puede entrar a esta pantalla', () => {
    simularApi({})
    mostrarRutas(vendedor, '/configuracion/catalogo')

    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})
