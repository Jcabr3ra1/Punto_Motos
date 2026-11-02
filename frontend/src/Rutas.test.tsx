import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueno, vendedor, simularApi, errorDeApi } from './test/apiSimulada'
import { pagina, producto } from './test/datos'
import { mostrarRutas as mostrar } from './test/mostrar'

const CONTEO_TERMINADO = { is_open: false, finished_at: '2026-11-01T08:00:00-05:00', finished_by: 'dueno', products_counted: 10, units_counted: 50 }
const CONTEO_ABIERTO = { is_open: true, finished_at: null, finished_by: null, products_counted: 3, units_counted: 12 }

beforeEach(() => {
  // Las pantallas de Configuración piden sus datos al abrirse.
  simularApi({
    'GET /settings/business': () => ({
      cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: '2026-11-01T08:00:00-05:00' },
    }),
    'GET /users': () => ({ cuerpo: [dueno, vendedor] }),
    'GET /products*': () => ({ cuerpo: pagina([producto()]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: CONTEO_TERMINADO }),
    'GET /catalog/categories*': () => ({ cuerpo: [] }),
    'GET /catalog/brands*': () => ({ cuerpo: [] }),
    'GET /catalog/motos*': () => ({ cuerpo: [] }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const menuPrincipal = () => screen.getByRole('navigation', { name: 'Principal' })
const menuConfiguracion = () => screen.getByRole('navigation', { name: 'Configuración' })

describe('menú principal', () => {
  it('muestra Inicio, Venta, Productos, Movimientos, Compras y Configuración, y marca la pantalla actual', () => {
    mostrar(dueno)

    const enlaces = within(menuPrincipal()).getAllByRole('link')
    expect(enlaces.map((e) => e.textContent)).toEqual(['Inicio', 'Venta', 'Productos', 'Movimientos', 'Compras', 'Configuración'])
    expect(within(menuPrincipal()).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
  })

  it('muestra el nombre y el rol de quien tiene la sesión abierta', () => {
    mostrar(vendedor)

    expect(screen.getByText('Ana Ruiz', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Vendedor', { selector: 'p' })).toBeInTheDocument()
  })

  it('navega a otra pantalla al elegirla', async () => {
    mostrar(dueno)

    await userEvent.setup().click(within(menuPrincipal()).getByRole('link', { name: 'Productos' }))

    expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument()
    expect(within(menuPrincipal()).getByRole('link', { name: 'Productos' })).toHaveAttribute('aria-current', 'page')
  })

  it('cierra la sesión desde el menú', async () => {
    const { cerrarSesion } = mostrar(dueno)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(cerrarSesion).toHaveBeenCalledTimes(1)
  })
})

describe('barra de estado', () => {
  it('muestra que hay conexión y la versión del backend', async () => {
    simularApi({ 'GET /health': () => ({ cuerpo: { status: 'ok', version: '0.4.0', server_time: 'x' } }) })
    mostrar(dueno)

    const barra = screen.getByRole('contentinfo')
    expect(await within(barra).findByText('Conectado')).toBeInTheDocument()
    expect(within(barra).getByText('Versión 0.4.0')).toBeInTheDocument()
  })

  it('avisa cuando no hay conexión con el programa', async () => {
    simularApi({ 'GET /health': () => errorDeApi(500, 'server_error', 'Fallo del programa.') })
    mostrar(dueno)

    expect(await within(screen.getByRole('contentinfo')).findByText('Sin conexión con el programa')).toBeInTheDocument()
  })
})

describe('barra superior', () => {
  const negocio = (name: string) => ({ cuerpo: { name, tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: 'x' } })

  it('muestra el nombre del negocio y quién tiene la sesión', async () => {
    simularApi({ 'GET /settings/business': () => negocio('Moto Taller Pérez') })
    mostrar(vendedor)

    const barra = screen.getByRole('banner')
    expect(await within(barra).findByText('Moto Taller Pérez')).toBeInTheDocument()
    expect(within(barra).getByText('Ana Ruiz')).toBeInTheDocument()
    expect(within(barra).getByText('Vendedor')).toBeInTheDocument()
    expect(within(barra).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('mientras el negocio no tenga nombre muestra el del programa', async () => {
    const api = simularApi({ 'GET /settings/business': () => negocio('') })
    mostrar(dueno)

    await waitFor(() => expect(api.cuantas('GET /settings/business')).toBe(1))
    expect(within(screen.getByRole('banner')).getByText('Punto Moto')).toBeInTheDocument()
  })

  it('si no se pueden cargar los datos del negocio, muestra el nombre del programa', async () => {
    simularApi({})
    mostrar(vendedor)

    expect(within(screen.getByRole('banner')).getByText('Punto Moto')).toBeInTheDocument()
  })

  it('cierra la sesión desde la barra', async () => {
    const { cerrarSesion } = mostrar(dueno)

    await userEvent.setup().click(within(screen.getByRole('banner')).getByRole('button', { name: 'Cerrar sesión' }))

    expect(cerrarSesion).toHaveBeenCalledTimes(1)
  })
})

describe('inventario inicial en el menú', () => {
  it('el dueño ve la entrada mientras el conteo esté abierto', async () => {
    simularApi({ 'GET /inventory/initial-count': () => ({ cuerpo: CONTEO_ABIERTO }) })
    mostrar(dueno)

    expect(await within(menuPrincipal()).findByRole('link', { name: 'Inventario inicial' })).toBeInTheDocument()
  })

  it('el dueño no la ve cuando el conteo ya terminó', async () => {
    const api = simularApi({ 'GET /inventory/initial-count': () => ({ cuerpo: CONTEO_TERMINADO }) })
    mostrar(dueno)

    await waitFor(() => expect(api.cuantas('GET /inventory/initial-count')).toBe(1))
    expect(within(menuPrincipal()).queryByRole('link', { name: 'Inventario inicial' })).not.toBeInTheDocument()
  })

  it('el vendedor nunca la ve y ni siquiera consulta el estado desde el menú', async () => {
    const api = simularApi({ 'GET /inventory/initial-count': () => ({ cuerpo: CONTEO_ABIERTO }) })
    mostrar(vendedor)

    expect(within(menuPrincipal()).queryByRole('link', { name: 'Inventario inicial' })).not.toBeInTheDocument()
    expect(api.cuantas('GET /inventory/initial-count')).toBe(0)
  })

  it('el vendedor que escribe la dirección ve que no tiene permiso', () => {
    mostrar(vendedor, '/inventario-inicial')

    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})

describe('configuración', () => {
  it('entra a Datos del negocio por defecto', () => {
    mostrar(dueno, '/configuracion')

    expect(screen.getByRole('heading', { name: 'Datos del negocio' })).toBeInTheDocument()
  })

  it.each(['/configuracion/negocio', '/configuracion/usuarios'])(
    'la pantalla %s tiene un solo título principal',
    (ruta) => {
      mostrar(dueno, ruta)

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    },
  )

  it('el aviso de falta de permiso no agrega otro título principal', () => {
    mostrar(vendedor, '/configuracion/usuarios')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('el dueño ve las tres pestañas', () => {
    mostrar(dueno, '/configuracion/negocio')

    const pestanas = within(menuConfiguracion()).getAllByRole('link')
    expect(pestanas.map((p) => p.textContent)).toEqual(['Datos del negocio', 'Tipos, marcas y motos', 'Usuarios'])
  })

  it('el vendedor solo ve Datos del negocio', () => {
    mostrar(vendedor, '/configuracion/negocio')

    const pestanas = within(menuConfiguracion()).getAllByRole('link')
    expect(pestanas.map((p) => p.textContent)).toEqual(['Datos del negocio'])
  })

  it('el dueño entra a Usuarios', () => {
    mostrar(dueno, '/configuracion/usuarios')

    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
  })

  it.each(['/configuracion/usuarios', '/configuracion/catalogo'])(
    'el vendedor que escribe la dirección %s ve que no tiene permiso',
    (ruta) => {
      mostrar(vendedor, ruta)

      expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver al inicio' })).toBeInTheDocument()
    },
  )
})

describe('direcciones inexistentes', () => {
  it('avisa que no encontró la pantalla', () => {
    mostrar(dueno, '/no-existe')

    expect(screen.getByRole('heading', { name: 'No encontramos esa pantalla' })).toBeInTheDocument()
  })
})
