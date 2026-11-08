import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueno, vendedor, simularApi, errorDeApi } from './test/apiSimulada'
import { RUTAS_ANTERIORES } from './navegacion/destinos'
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
    'GET /service-types*': () => ({ cuerpo: [] }),
    'GET /mechanics*': () => ({ cuerpo: [] }),
    'GET /inventory/movements*': () => ({ cuerpo: pagina([]) }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const menuPrincipal = () => screen.getByRole('navigation', { name: 'Principal' })

describe('menú principal', () => {
  it('muestra el menú completo del dueño y marca la pantalla actual', () => {
    mostrar(dueno)

    const enlaces = within(menuPrincipal()).getAllByRole('link')
    expect(enlaces.map((e) => e.textContent)).toEqual(['Inicio', 'Venta', 'Productos', 'Movimientos', 'Compras', 'Taller', 'Caja', 'Consignación', 'Configuración'])
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

describe('barra superior: ubicación y caja', () => {
  it('muestra la sección y la pestaña donde se está', () => {
    mostrar(dueno, '/configuracion/usuarios')

    expect(within(screen.getByRole('navigation', { name: 'Estás en' })).getByText('Configuración')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Estás en' })).getByText('Usuarios')).toBeInTheDocument()
  })

  it('al dueño le muestra el efectivo esperado y lo lleva a la caja', async () => {
    simularApi({
      'GET /cash-sessions/current': () => ({
        cuerpo: { is_open: true, session: { id: 1, is_open: true, opening_cash: 50000, expected_cash: 95000, counted_cash: null, difference: null, closing_notes: '', opened_by: 'dueno', opened_at: 'x', closed_by: null, closed_at: null }, suggested_opening_cash: 0 },
      }),
    })
    mostrar(dueno)

    const enlace = await within(screen.getByRole('banner')).findByRole('link', { name: /Caja abierta · \$\s?95\.000 en el cajón/ })
    expect(enlace).toHaveAttribute('href', '/caja/actual')
  })

  it('al vendedor solo le dice si la caja está cerrada, sin montos ni enlace', async () => {
    simularApi({ 'GET /cash-sessions/current': () => ({ cuerpo: { is_open: false } }) })
    mostrar(vendedor)

    expect(await within(screen.getByRole('banner')).findByText('Caja cerrada')).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: /Caja/ })).not.toBeInTheDocument()
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
    mostrar(vendedor, '/inventario/inicial')

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

describe('pantallas en su sección', () => {
  it.each([
    ['/inventario/productos', 'Productos'],
    ['/inventario/catalogo', 'Tipos, marcas y motos'],
    ['/taller/mecanicos', 'Mecánicos'],
    ['/taller/servicios', 'Tipos de servicio'],
    ['/configuracion/actualizaciones', 'Actualizar programa'],
  ])('las pantallas movidas abren en su ruta nueva: %s', async (ruta, titulo) => {
    mostrar(dueno, ruta)

    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument()
  })

  it.each(Object.entries(RUTAS_ANTERIORES))('la ruta anterior %s lleva a %s', async (anterior) => {
    mostrar(dueno, anterior)

    expect(screen.queryByRole('heading', { name: 'No encontramos esa pantalla' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  })

  it('/inventario lleva a Productos', async () => {
    mostrar(dueno, '/inventario')

    expect(await screen.findByRole('heading', { name: 'Productos' })).toBeInTheDocument()
  })

  it.each(['/inventario/catalogo', '/taller/mecanicos', '/configuracion/actualizaciones'])(
    'el vendedor no entra a %s',
    (ruta) => {
      mostrar(vendedor, ruta)

      expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
    },
  )

  it.each(['/compras/proveedores', '/configuracion/negocio', '/inventario/productos', '/taller/mecanicos'])(
    'la sección de %s tiene un solo título principal',
    (ruta) => {
      mostrar(dueno, ruta)

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    },
  )

  it('Inicio ya no ofrece actualizar el programa', () => {
    mostrar(dueno)

    expect(screen.queryByText('Buscando actualizaciones…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /buscar actualizaciones/i })).not.toBeInTheDocument()
  })
})

describe('direcciones inexistentes', () => {
  it('avisa que no encontró la pantalla', () => {
    mostrar(dueno, '/no-existe')

    expect(screen.getByRole('heading', { name: 'No encontramos esa pantalla' })).toBeInTheDocument()
  })
})
