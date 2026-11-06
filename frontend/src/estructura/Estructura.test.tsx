import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../test/apiSimulada'
import { pagina, producto } from '../test/datos'
import { mostrarRutas } from '../test/mostrar'

beforeEach(() => {
  simularApi({
    'GET /settings/business': () => ({
      cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: '2026-11-01T08:00:00-05:00' },
    }),
    'GET /products*': () => ({ cuerpo: pagina([producto()]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /suppliers*': () => ({ cuerpo: [] }),
    'GET /cash/current': () => ({ cuerpo: { is_open: false } }),
  })
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

const columna = () => screen.getByRole('navigation', { name: 'Principal' })

describe('marco tablero', () => {
  it('el vendedor no ve los módulos del dueño en la columna de iconos', () => {
    mostrarRutas(vendedor)

    for (const modulo of ['Compras', 'Caja', 'Consignación', 'Taller']) {
      expect(within(columna()).queryByRole('link', { name: modulo })).not.toBeInTheDocument()
    }
    expect(within(columna()).getByRole('link', { name: 'Venta' })).toBeInTheDocument()
  })

  it('el panel contextual muestra las pantallas del módulo actual y marca la abierta', () => {
    mostrarRutas(dueno, '/compras/proveedores')

    const panel = screen.getByRole('navigation', { name: 'Compras' })
    expect(within(panel).getAllByRole('link').map((enlace) => enlace.textContent)).toEqual(['Compras', 'Proveedores', 'Abonos'])
    expect(within(panel).getByRole('link', { name: 'Proveedores' })).toHaveAttribute('aria-current', 'page')
    expect(within(columna()).getByRole('link', { name: 'Compras' })).toHaveAttribute('aria-current', 'page')
  })

  it('el panel contextual del vendedor no muestra pantallas del dueño', () => {
    mostrarRutas(vendedor, '/configuracion/negocio')

    const panel = screen.getByRole('navigation', { name: 'Configuración' })
    expect(within(panel).getAllByRole('link').map((enlace) => enlace.textContent)).toEqual(['Datos del negocio'])
  })

  it('Ctrl+B recoge el panel, la columna sigue y la preferencia se recuerda', async () => {
    mostrarRutas(dueno, '/compras/proveedores')

    await userEvent.setup().keyboard('{Control>}b{/Control}')

    expect(screen.queryByRole('link', { name: 'Proveedores', current: 'page' })).toBeInTheDocument()
    expect(document.querySelector('.panel-contextual')).toBeNull()
    expect(within(columna()).getByRole('link', { name: 'Inicio' })).toBeInTheDocument()
    expect(localStorage.getItem('puntomoto.menuRecogido')).toBe('1')

    cleanup()
    mostrarRutas(dueno, '/compras/proveedores')
    expect(document.querySelector('.panel-contextual')).toBeNull()
  })

  it('con el panel recogido, la sección muestra sus pestañas para no perder el camino', async () => {
    localStorage.setItem('puntomoto.menuRecogido', '1')
    mostrarRutas(dueno, '/compras/proveedores')

    const pestanas = screen.getByRole('navigation', { name: 'Compras' })
    expect(within(pestanas).getAllByRole('link').map((enlace) => enlace.textContent)).toEqual(['Compras', 'Proveedores', 'Abonos'])
  })

  it('el botón de la columna también recoge y expande el panel', async () => {
    mostrarRutas(dueno, '/compras/proveedores')
    const u = userEvent.setup()

    await u.click(screen.getByRole('button', { name: 'Recoger el menú' }))
    expect(document.querySelector('.panel-contextual')).toBeNull()

    await u.click(screen.getByRole('button', { name: 'Expandir el menú' }))
    expect(document.querySelector('.panel-contextual')).not.toBeNull()
  })
})
