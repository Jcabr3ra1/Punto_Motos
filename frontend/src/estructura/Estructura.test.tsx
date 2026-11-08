import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../test/apiSimulada'
import { pagina, producto, venta } from '../test/datos'
import { mostrarRutas } from '../test/mostrar'

const CONTEO_ABIERTO = { is_open: true, finished_at: null, finished_by: null, products_counted: 3, units_counted: 12 }

beforeEach(() => {
  simularApi({
    'GET /settings/business': () => ({
      cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: '2026-11-01T08:00:00-05:00' },
    }),
    'GET /products*': () => ({ cuerpo: pagina([producto()]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /suppliers*': () => ({ cuerpo: [] }),
    'GET /purchases*': () => ({ cuerpo: pagina([]) }),
    'GET /mechanics*': () => ({ cuerpo: [] }),
    'GET /service-types*': () => ({ cuerpo: [] }),
    'GET /sales/41': () => ({ cuerpo: venta({ id: 41 }) }),
    'GET /cash/current': () => ({ cuerpo: { is_open: false } }),
  })
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

const menu = () => screen.getByRole('navigation', { name: 'Principal' })
/** Las entradas de primer nivel del menú: Inicio (enlace) y cada sección (botón). */
const secciones = () =>
  Array.from(menu().querySelectorAll<HTMLElement>('.menu-lateral__seccion')).map(
    (entrada) => entrada.getAttribute('aria-label') ?? entrada.textContent,
  )
const pantallasDe = (seccion: string) =>
  within(screen.getByRole('group', { name: seccion }))
    .getAllByRole('link')
    .map((enlace) => enlace.textContent)
const seccion = (nombre: string) => within(menu()).getByRole('button', { name: nombre })

describe('menú lateral', () => {
  it('el dueño ve las secciones en orden', () => {
    mostrarRutas(dueno)

    expect(secciones()).toEqual(['Inicio', 'Mostrador', 'Inventario', 'Taller', 'Compras', 'Caja', 'Consignación', 'Configuración'])
  })

  it('el vendedor solo ve sus secciones', () => {
    mostrarRutas(vendedor)

    expect(secciones()).toEqual(['Inicio', 'Mostrador', 'Inventario', 'Configuración'])
  })

  it('la sección actual está desplegada y marca la pantalla', () => {
    mostrarRutas(dueno, '/taller/mecanicos')

    expect(seccion('Taller')).toHaveAttribute('aria-expanded', 'true')
    expect(pantallasDe('Taller')).toEqual(['Liquidación del día', 'Historial de liquidaciones', 'Mecánicos', 'Tipos de servicio'])
    expect(within(menu()).getByRole('link', { name: 'Mecánicos' })).toHaveAttribute('aria-current', 'page')
    expect(seccion('Compras')).toHaveAttribute('aria-expanded', 'false')
    expect(within(menu()).queryByRole('link', { name: 'Proveedores' })).not.toBeInTheDocument()
  })

  it('al abrir otra sección va a su primera pantalla y cierra la anterior', async () => {
    mostrarRutas(dueno, '/taller/mecanicos')

    await userEvent.setup().click(seccion('Compras'))

    expect(await screen.findByRole('heading', { name: 'Compras', level: 2 })).toBeInTheDocument()
    expect(seccion('Compras')).toHaveAttribute('aria-expanded', 'true')
    expect(seccion('Taller')).toHaveAttribute('aria-expanded', 'false')
  })

  it('pulsar la sección abierta no la cierra', async () => {
    mostrarRutas(dueno, '/compras/proveedores')

    await userEvent.setup().click(seccion('Compras'))

    expect(seccion('Compras')).toHaveAttribute('aria-expanded', 'true')
    expect(within(menu()).getByRole('link', { name: 'Proveedores' })).toHaveAttribute('aria-current', 'page')
  })

  it('en una pantalla de detalle se marca su pantalla madre', () => {
    mostrarRutas(dueno, '/venta/historial/41')

    expect(seccion('Mostrador')).toHaveAttribute('aria-expanded', 'true')
    expect(within(menu()).getByRole('link', { name: 'Ventas' })).toHaveAttribute('aria-current', 'page')
  })

  it('Inventario del vendedor no muestra pantallas del dueño', () => {
    mostrarRutas(vendedor, '/inventario/productos')

    expect(pantallasDe('Inventario')).toEqual(['Productos', 'Movimientos'])
  })

  it('el inventario inicial aparece en Inventario solo con el conteo abierto', async () => {
    simularApi({ 'GET /inventory/initial-count': () => ({ cuerpo: CONTEO_ABIERTO }) })
    mostrarRutas(dueno, '/inventario/productos')

    expect(await within(menu()).findByRole('link', { name: 'Inventario inicial' })).toBeInTheDocument()

    cleanup()
    simularApi({ 'GET /inventory/initial-count': () => ({ cuerpo: { ...CONTEO_ABIERTO, is_open: false } }) })
    mostrarRutas(dueno, '/inventario/productos')

    expect(pantallasDe('Inventario')).toEqual(['Productos', 'Movimientos', 'Tipos, marcas y motos'])
  })

  it('Configuración va al pie, separada de las secciones del día', () => {
    mostrarRutas(dueno)

    expect(seccion('Configuración').closest('.menu-lateral__pie')).not.toBeNull()
  })

  it('Ctrl+B recoge el menú y la preferencia se recuerda', async () => {
    mostrarRutas(dueno, '/compras/proveedores')

    await userEvent.setup().keyboard('{Control>}b{/Control}')

    expect(document.querySelector('.menu-lateral--recogido')).not.toBeNull()
    expect(localStorage.getItem('puntomoto.menuRecogido')).toBe('1')

    cleanup()
    mostrarRutas(dueno, '/compras/proveedores')
    expect(document.querySelector('.menu-lateral--recogido')).not.toBeNull()
  })

  it('el botón del pie también recoge y expande el menú', async () => {
    mostrarRutas(dueno, '/compras/proveedores')
    const u = userEvent.setup()

    await u.click(screen.getByRole('button', { name: 'Recoger el menú' }))
    expect(document.querySelector('.menu-lateral--recogido')).not.toBeNull()

    await u.click(screen.getByRole('button', { name: 'Expandir el menú' }))
    expect(document.querySelector('.menu-lateral--recogido')).toBeNull()
  })
})

describe('menú recogido', () => {
  beforeEach(() => localStorage.setItem('puntomoto.menuRecogido', '1'))

  it('el foco en una sección muestra sus pantallas', async () => {
    mostrarRutas(dueno)

    seccion('Taller').focus()

    const ventanita = await screen.findByRole('group', { name: 'Taller' })
    expect(within(ventanita).getAllByRole('link').map((enlace) => enlace.textContent)).toEqual([
      'Liquidación del día',
      'Historial de liquidaciones',
      'Mecánicos',
      'Tipos de servicio',
    ])
  })

  it('pasar el ratón por una sección muestra sus pantallas y salir las oculta', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await u.hover(seccion('Compras'))
    expect(screen.getByRole('group', { name: 'Compras' })).toBeInTheDocument()

    await u.unhover(seccion('Compras'))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Compras' })).not.toBeInTheDocument())
  })

  it('Esc cierra la ventanita y devuelve el foco a la sección', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()
    seccion('Taller').focus()
    await u.tab()
    expect(within(screen.getByRole('group', { name: 'Taller' })).getByRole('link', { name: 'Liquidación del día' })).toHaveFocus()

    await u.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: 'Taller' })).not.toBeInTheDocument()
    expect(seccion('Taller')).toHaveFocus()
  })

  it('elegir una pantalla navega y cierra la ventanita', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()
    await u.hover(seccion('Taller'))

    await u.click(within(screen.getByRole('group', { name: 'Taller' })).getByRole('link', { name: 'Mecánicos' }))

    expect(await screen.findByRole('heading', { name: 'Mecánicos' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Taller' })).not.toBeInTheDocument()
  })

  it('pulsar la sección va a su primera pantalla', async () => {
    mostrarRutas(dueno)

    await userEvent.setup().click(seccion('Compras'))

    expect(await screen.findByRole('heading', { name: 'Compras', level: 2 })).toBeInTheDocument()
  })

  it('Esc fuera de la ventanita no la toca ni hace nada en el menú', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()
    await u.hover(seccion('Caja'))
    screen.getByRole('main').focus()

    await u.keyboard('{Escape}')

    expect(screen.getByRole('group', { name: 'Caja' })).toBeInTheDocument()
  })
})

