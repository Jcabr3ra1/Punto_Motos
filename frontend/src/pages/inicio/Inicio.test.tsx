import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrentCash, DailySettlement, Sale } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { caja, local, paginaDe, producto, proveedor, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'
import { saludoSegunHora } from '../../utilidades/saludo'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Una venta de la lista (sin líneas), por defecto de hoy a las 10 a. m. */
function ventaDeLista(cambios: Partial<Sale> = {}): Sale {
  const { items: _i, services: _s, payments: _p, notes: _n, voided_at: _va, voided_by: _vb, void_reason: _vr, ...lista } = venta()
  return { ...lista, created_at: '2026-11-07T10:15:00-05:00', ...cambios }
}

const LIQUIDACION: DailySettlement = {
  date: '2026-11-07',
  total: 186000,
  mechanics: [
    { mechanic: { id: 1, name: 'Pedro' }, services_count: 7, labor_total: 200000, percentage: 60, share: 120000, deductions_total: 0, amount: 120000 },
    { mechanic: { id: 2, name: 'Luis' }, services_count: 4, labor_total: 110000, percentage: 60, share: 66000, deductions_total: 0, amount: 66000 },
  ],
}

function abrir(usuario: typeof dueno, rutas: Parameters<typeof simularApi>[0] = {}, actual: CurrentCash = { is_open: true, session: caja() }) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: actual }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /sales*': () => ({ cuerpo: paginaDe([ventaDeLista()]) }),
    'GET /mechanic-settlements/daily*': () => ({ cuerpo: LIQUIDACION }),
    'GET /suppliers*': () => ({ cuerpo: [proveedor({ balance_due: 3000000 }), proveedor({ id: 2, balance_due: 920000 })] }),
    'GET /consignees*': () => ({ cuerpo: [local({ balance_due: 640000 })] }),
    ...rutas,
  })
  mostrarRutas(usuario, '/')
  return api
}

const instrumento = (nombre: string) => screen.findByRole('region', { name: nombre })

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

describe('inicio del dueño', () => {
  it('saluda con el nombre y ofrece una venta nueva y recibir una compra', () => {
    abrir(dueno)

    expect(screen.getByRole('heading', { level: 1, name: /Carlos Pérez/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nueva venta/ })).toHaveAttribute('href', '/venta/vender')
    expect(screen.getByRole('link', { name: 'Recibir compra' })).toHaveAttribute('href', '/compras/lista')
  })

  it('ve la caja, las ventas, los mecánicos y las cuentas', async () => {
    abrir(dueno, {
      'GET /sales*': () => ({
        cuerpo: paginaDe([ventaDeLista({ id: 1, total: 2000000 }), ventaDeLista({ id: 2, total: 415000 })], { count: 2 }),
      }),
    }, { is_open: true, session: caja({ expected_cash: 1284000, opening_cash: 200000 }) })

    const cajaDeHoy = await instrumento('Caja de hoy')
    await waitFor(() => expect(cajaDeHoy).toHaveTextContent(/\$\s?1\.284\.000/))
    expect(cajaDeHoy).toHaveTextContent(/Abrió con \$\s?200\.000/)
    const ventas = await instrumento('Ventas de hoy')
    await waitFor(() => expect(ventas).toHaveTextContent(/\$\s?2\.415\.000/))
    expect(within(ventas).getByText('2 ventas')).toBeInTheDocument()
    const mecanicos = await instrumento('Mecánicos hoy')
    await waitFor(() => expect(mecanicos).toHaveTextContent(/\$\s?186\.000/))
    expect(mecanicos).toHaveTextContent('por pagar a 2 mecánicos · 11 servicios')
    const cuentas = await instrumento('Cuentas')
    await waitFor(() => expect(cuentas).toHaveTextContent(/Debo a proveedores\s*\$\s?3\.920\.000/))
    expect(cuentas).toHaveTextContent(/Me deben los locales\s*\$\s?640\.000/)
  })

  it('con la caja cerrada ofrece abrirla', async () => {
    abrir(dueno, {}, { is_open: false, session: null, suggested_opening_cash: 0 })

    const tarjeta = await instrumento('Caja de hoy')
    await waitFor(() => expect(tarjeta).toHaveTextContent('La caja está cerrada'))
    expect(within(tarjeta).getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja/actual')
  })

  it('suma las ventas de todas las páginas', async () => {
    const api = abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        if (String(ruta).includes('page_size=5')) return { cuerpo: paginaDe([ventaDeLista()], { count: 403 }) }
        const pagina = Number(new URLSearchParams(String(ruta).split('?')[1]).get('page') ?? 1)
        const cuantas = pagina < 3 ? 200 : 3
        const ventas = Array.from({ length: cuantas }, (_, i) => ventaDeLista({ id: pagina * 1000 + i, total: 1000 }))
        return { cuerpo: paginaDe(ventas, { count: 403, next: pagina < 3 ? `x?page=${pagina + 1}` : null }) }
      },
    })

    const ventas = await instrumento('Ventas de hoy')
    await waitFor(() => expect(within(ventas).getByText('403 ventas')).toBeInTheDocument())
    expect(ventas).toHaveTextContent(/\$\s?403\.000/)
    expect(api.llamadas.filter((l) => l.clave.startsWith('GET /sales?') && l.clave.includes('voided=false'))).toHaveLength(3)
  })

  it('si un dato falla, solo su recuadro muestra el error', async () => {
    abrir(dueno, { 'GET /suppliers*': () => errorDeApi(500, 'server_error', 'Falló.') })

    const cuentas = await instrumento('Cuentas')
    await waitFor(() => expect(cuentas).toHaveTextContent('No se pudo cargar'))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Mecánicos hoy' })).toHaveTextContent(/\$\s?186\.000/))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Caja de hoy' })).toHaveTextContent(/\$\s?75\.000/))
  })

  it('Nada por pagar hoy cuando no hay servicios pendientes', async () => {
    abrir(dueno, { 'GET /mechanic-settlements/daily*': () => ({ cuerpo: { date: '2026-11-07', total: 0, mechanics: [] } }) })

    await waitFor(async () => expect(await instrumento('Mecánicos hoy')).toHaveTextContent('Nada por pagar hoy'))
  })

  it('las últimas ventas muestran las anuladas tachadas y abren la venta', async () => {
    abrir(dueno, {
      'GET /sales*': () => ({
        cuerpo: paginaDe([
          ventaDeLista({ id: 12, number: 412, customer: null, services_count: 1, items_count: 2 }),
          ventaDeLista({ id: 11, number: 411, is_voided: true }),
        ]),
      }),
    })

    const tabla = await screen.findByRole('table', { name: 'Últimas ventas de hoy' })
    const [, primera, anulada] = await within(tabla).findAllByRole('row')
    expect(primera).toHaveTextContent('Sin cliente')
    expect(primera).toHaveTextContent('2 + taller')
    expect(anulada).toHaveClass('tabla__fila--anulada')
    expect(within(primera).getByRole('link', { name: '#0412' })).toHaveAttribute('href', '/venta/historial/12')
  })

  it('ofrece ir a las pantallas más usadas', () => {
    abrir(dueno)

    const irA = screen.getByRole('navigation', { name: 'Ir a' })
    expect(within(irA).getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).toEqual([
      '/venta/vender',
      '/inventario/productos',
      '/taller/liquidacion',
      '/compras/lista',
    ])
  })

  it('Ctrl+N abre Vender', async () => {
    abrir(dueno)

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(await screen.findByRole('region', { name: 'Productos de la venta' })).toBeInTheDocument()
  })
})

describe('inicio del vendedor', () => {
  it('no ve caja, mecánicos ni cuentas, y no los pide', async () => {
    const api = abrir(vendedor)

    expect(screen.getByRole('heading', { level: 1, name: /Ana Ruiz/ })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Ventas de hoy' })
    expect(screen.queryByRole('region', { name: 'Caja de hoy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuentas' })).not.toBeInTheDocument()
    const pedidas = api.llamadas.map((l) => l.clave)
    expect(pedidas.some((c) => c.startsWith('GET /mechanic-settlements'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /suppliers'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /consignees'))).toBe(false)
  })

  it('dice si la caja está abierta para vender', async () => {
    abrir(vendedor, {}, { is_open: false })

    expect(await screen.findByText(/la caja está cerrada: pídele al dueño que la abra/)).toBeInTheDocument()
  })

  it('consulta precio y existencia', async () => {
    abrir(vendedor, { 'GET /catalog/search*': () => ({ cuerpo: [producto({ sale_price: 25000, stock: 2 })] }) })

    await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Consultar precio y existencia' }), 'pa')

    const resultados = await screen.findByRole('list', { name: 'Resultados de la consulta' })
    expect(resultados).toHaveTextContent('Pastillas de freno')
    expect(resultados).toHaveTextContent(/\$\s?25\.000/)
    expect(resultados).toHaveTextContent('2 und.')
  })
})
