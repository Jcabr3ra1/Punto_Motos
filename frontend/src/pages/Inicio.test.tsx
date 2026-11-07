import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrentCash } from '../api/types'
import { dueno, simularApi, vendedor } from '../test/apiSimulada'
import { caja } from '../test/datos'
import { mostrarRutas } from '../test/mostrar'
import { saludoSegunHora } from '../utilidades/saludo'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(usuario: typeof dueno, actual: CurrentCash) {
  simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: actual }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
  })
  mostrarRutas(usuario, '/')
}

const accesos = () => screen.getByRole('navigation', { name: 'Accesos rápidos' })

describe('saludoSegunHora', () => {
  it('saluda según la hora del día', () => {
    expect(saludoSegunHora(new Date(2026, 10, 6, 8, 0))).toBe('Buenos días')
    expect(saludoSegunHora(new Date(2026, 10, 6, 11, 59))).toBe('Buenos días')
    expect(saludoSegunHora(new Date(2026, 10, 6, 12, 0))).toBe('Buenas tardes')
    expect(saludoSegunHora(new Date(2026, 10, 6, 18, 59))).toBe('Buenas tardes')
    expect(saludoSegunHora(new Date(2026, 10, 6, 19, 0))).toBe('Buenas noches')
    expect(saludoSegunHora(new Date(2026, 10, 6, 2, 0))).toBe('Buenas noches')
  })
})

describe('inicio', () => {
  it('saluda con el nombre y ofrece una venta nueva', () => {
    abrir(vendedor, { is_open: true })

    expect(screen.getByRole('heading', { level: 1, name: /Ana Ruiz/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nueva venta' })).toHaveAttribute('href', '/venta/vender')
  })

  it('el vendedor ve Vender y Productos, sin caja ni liquidación', () => {
    abrir(vendedor, { is_open: true })

    expect(within(accesos()).getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).toEqual(['/venta/vender', '/productos'])
    expect(screen.queryByRole('region', { name: 'Caja de hoy' })).not.toBeInTheDocument()
  })

  it('el dueño ve también la caja de hoy y la liquidación en los accesos', () => {
    abrir(dueno, { is_open: true, session: caja() })

    expect(within(accesos()).getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).toEqual([
      '/venta/vender',
      '/productos',
      '/caja/actual',
      '/taller/liquidacion',
    ])
  })

  it('el dueño ve la caja abierta con el efectivo esperado y la apertura', async () => {
    abrir(dueno, { is_open: true, session: caja({ expected_cash: 412000, opening_cash: 100000 }) })

    const tarjeta = await screen.findByRole('region', { name: 'Caja de hoy' })
    expect(tarjeta).toHaveTextContent(/\$\s?412\.000/)
    expect(tarjeta).toHaveTextContent(/Abrió con \$\s?100\.000/)
  })

  it('una hora de apertura ilegible no rompe la pantalla', async () => {
    abrir(dueno, { is_open: true, session: caja({ expected_cash: 95000, opening_cash: 50000, opened_at: 'x' }) })

    const tarjeta = await screen.findByRole('region', { name: 'Caja de hoy' })
    expect(tarjeta).toHaveTextContent(/Abrió con \$\s?50\.000/)
  })

  it('con la caja cerrada, el dueño puede ir a abrirla', async () => {
    abrir(dueno, { is_open: false, session: null, suggested_opening_cash: 0 })

    const tarjeta = await screen.findByRole('region', { name: 'Caja de hoy' })
    expect(tarjeta).toHaveTextContent('La caja está cerrada')
    expect(within(tarjeta).getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja/actual')
  })
})
