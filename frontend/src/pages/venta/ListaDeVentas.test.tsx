import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sale } from '../../api/types'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { paginaDe, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function deLista(cambios: Partial<Sale> = {}): Sale {
  const { items: _i, services: _s, payments: _p, notes: _n, voided_at: _va, voided_by: _vb, void_reason: _vr, ...lista } = venta()
  return { ...lista, ...cambios }
}

const VENTAS = [deLista({ id: 41, number: 41, total: 25000 }), deLista({ id: 42, number: 42, total: 80000, customer: null })]

function abrir(usuario = dueno, ventas: Sale[] = VENTAS) {
  const api = simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /mechanics*': () => ({ cuerpo: [] }),
    'GET /sales*': (_, ruta) => {
      const consulta = new URLSearchParams(String(ruta).split('?')[1])
      if (consulta.get('voided') === 'true') return { cuerpo: paginaDe([], { count: 2 }) }
      if (consulta.get('voided') === 'false') return { cuerpo: paginaDe([deLista({ total: 30000 }), deLista({ id: 2, total: 45000 })], { count: 2 }) }
      const numero = consulta.get('number')
      return { cuerpo: paginaDe(numero ? ventas.filter((v) => String(v.number) === numero) : ventas) }
    },
    'GET /sales/41': () => ({ cuerpo: venta({ id: 41, number: 41 }) }),
    'GET /sales/42': () => ({ cuerpo: venta({ id: 42, number: 42, customer: null, total: 80000 }) }),
  })
  mostrarRutas(usuario, '/venta/historial')
  return api
}

const tabla = () => screen.findByRole('table', { name: 'Ventas' })

describe('ventas', () => {
  it('tiene su encabezado con la acción de vender', () => {
    abrir()

    expect(screen.getByRole('heading', { level: 2, name: 'Ventas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nueva venta/ })).toHaveAttribute('href', '/venta/vender')
  })

  it('los indicadores muestran las cifras exactas de hoy', async () => {
    abrir()

    const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
    await waitFor(() => expect(within(indicadores).getAllByRole('definition').map((d) => d.textContent?.replace(/\s/g, ' '))).toEqual(['2', '$ 75.000', '2']))
    expect(within(indicadores).getAllByRole('term').map((t) => t.textContent)).toEqual(['Ventas de hoy', 'Total de hoy', 'Anuladas hoy'])
  })

  it('un clic en la fila abre la ficha de la venta', async () => {
    abrir()
    const u = userEvent.setup()

    await u.click(within(await tabla()).getByText('Ana Gómez'))

    const ficha = await screen.findByRole('complementary', { name: 'Venta N.º 41' })
    await waitFor(() => expect(ficha).toHaveTextContent('Pastillas de freno Pulsar 180'))
    // El recibo se abre en una ventana emergente sobre la lista, con Devolver y Anular en su pie.
    await u.click(within(ficha).getByRole('button', { name: 'Abrir el recibo' }))
    const ventana = await screen.findByRole('dialog', { name: 'Venta n.º 41' })
    await waitFor(() => expect(ventana).toHaveTextContent('Pastillas de freno Pulsar 180'))
    expect(within(ventana).getByRole('button', { name: /Anular venta/ })).toBeInTheDocument()
    await u.click(within(ventana).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('las flechas mueven la ficha y Esc la cierra', async () => {
    abrir()
    const u = userEvent.setup()
    const contenedor = (await tabla()).closest<HTMLElement>('.tabla-contenedor')!
    contenedor.focus()

    await u.keyboard('{ArrowDown}')
    expect(await screen.findByRole('complementary', { name: 'Venta N.º 41' })).toBeInTheDocument()
    await u.keyboard('{ArrowDown}')
    expect(await screen.findByRole('complementary', { name: 'Venta N.º 42' })).toBeInTheDocument()

    await u.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: /Venta N\.º/ })).not.toBeInTheDocument()
  })

  it('si la venta elegida desaparece al filtrar, la ficha se cierra', async () => {
    abrir()
    const u = userEvent.setup()
    await u.click(within(await tabla()).getByText('Ana Gómez'))
    expect(await screen.findByRole('complementary', { name: 'Venta N.º 41' })).toBeInTheDocument()

    await u.type(screen.getByLabelText('N.º de recibo'), '42')

    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Venta N.º 41' })).not.toBeInTheDocument())
  })

  it('sin ventas muestra el estado vacío con la acción de vender', async () => {
    abrir(vendedor, [])

    expect(await screen.findByText('Todavía no hay ventas hoy.')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Todas las fechas' }))
    expect(await screen.findByText('Todavía no hay ventas.')).toBeInTheDocument()
  })
})
