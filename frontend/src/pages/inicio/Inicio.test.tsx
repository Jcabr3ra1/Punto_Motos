import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrentCash, DailySettlement, Sale } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { caja, local, paginaDe, producto, proveedor, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'
import { diaEnColombia, hoyEnColombia, moverDia } from '../../utilidades/fechas'
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

  it('calcula fechas calendario en Colombia sin desfase horario', () => {
    expect(moverDia('2026-11-08', -6)).toBe('2026-11-02')
    expect(moverDia('2026-03-03', -6)).toBe('2026-02-25')
    expect(moverDia('2026-01-05', -10)).toBe('2025-12-26')
    expect(diaEnColombia('2026-11-09T04:40:00Z')).toBe('2026-11-08')
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

    const hoy = hoyEnColombia()
    const ventas = await instrumento('Ventas de hoy')
    await waitFor(() => expect(within(ventas).getByText('403 ventas')).toBeInTheDocument())
    expect(ventas).toHaveTextContent(/\$\s?403\.000/)
    expect(api.llamadas.filter((l) => l.clave.startsWith('GET /sales?') && l.clave.includes(`date_from=${hoy}`) && l.clave.includes('voided=false'))).toHaveLength(3)
  })

  it('las cuentas incluyen lo que deben proveedores y locales desactivados', async () => {
    const api = abrir(dueno)

    await instrumento('Cuentas')
    await waitFor(() => expect(api.llamadas.some((l) => l.clave.startsWith('GET /suppliers'))).toBe(true))
    const pedidas = api.llamadas.map((l) => l.clave).filter((c) => c.startsWith('GET /suppliers') || c.startsWith('GET /consignees'))
    expect(pedidas.every((c) => c.includes('include_inactive=true'))).toBe(true)
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

  it('abajo van las últimas ventas y lo que se está acabando, sin el panel «Ir a»', async () => {
    abrir(dueno)

    expect(await screen.findByRole('region', { name: 'Se están acabando' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Ir a' })).not.toBeInTheDocument()
  })

  it('el cobro de la caja se lee con palabras completas, sin abreviar', async () => {
    abrir(dueno)

    const cajaDeHoy = await instrumento('Caja de hoy')
    await waitFor(() => expect(cajaDeHoy).toHaveTextContent(/Efectivo \d+\s%.*Transferencia \d+\s%/))
    expect(cajaDeHoy).not.toHaveTextContent(/efec\.|transf\./)
  })

  it('Ctrl+N abre Vender', async () => {
    abrir(dueno)

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(await screen.findByRole('region', { name: 'Productos de la venta' })).toBeInTheDocument()
  })

  it('muestra gráficas accesibles en los cuatro instrumentos superiores y cuenta ventas con taller', async () => {
    const hoy = hoyEnColombia()
    abrir(
      dueno,
      {
        'GET /sales*': () => ({
          cuerpo: paginaDe([
            ventaDeLista({ id: 1, total: 300000, services_count: 2, created_at: `${hoy}T10:15:00-05:00` }),
            ventaDeLista({ id: 2, total: 150000, services_count: 0, created_at: `${hoy}T23:30:00-05:00` }),
          ]),
        }),
      },
      {
        is_open: true,
        session: caja({
          expected_cash: 520000,
          opening_cash: 100000,
          summary: {
            by_kind: [
              { kind: 'sale', kind_label: 'Venta', cash: 300000, transfer: 150000 },
              { kind: 'consignee_payment', kind_label: 'Pago de consignación', cash: 50000, transfer: 0 },
              { kind: 'expense', kind_label: 'Gasto', cash: -30000, transfer: 0 },
            ],
            cash_total: 320000,
            transfer_total: 150000,
          },
        }),
      },
    )

    const cajaDeHoy = await instrumento('Caja de hoy')
    await waitFor(() => expect(within(cajaDeHoy).getByRole('img', { name: /Cobros de hoy/i })).toBeInTheDocument())
    expect(cajaDeHoy).toHaveTextContent(/70\s*%/)
    expect(cajaDeHoy).toHaveTextContent(/30\s*%/)

    const ventas = await instrumento('Ventas de hoy')
    await waitFor(() => expect(within(ventas).getByRole('img', { name: /Ventas por hora de hoy/i })).toBeInTheDocument())
    expect(ventas).toHaveTextContent('1 con taller')
    expect(ventas).toHaveTextContent(/11 p\. m\./)

    const mecanicos = await instrumento('Mecánicos hoy')
    await waitFor(() => expect(within(mecanicos).getByRole('img', { name: /Por pagar hoy por mecánico/i })).toBeInTheDocument())
    expect(mecanicos).toHaveTextContent('Pedro')
    expect(mecanicos).toHaveTextContent(/\$\s?120\.000/)

    const cuentas = await instrumento('Cuentas')
    await waitFor(() => expect(within(cuentas).getByRole('img', { name: /Comparación de cuentas/i })).toBeInTheDocument())
    expect(cuentas).toHaveTextContent('2 proveedores · 1 local')
  })

  it('muestra el ritmo de ventas de 7 días recorriendo páginas y permite cambiar a 30 días', async () => {
    const hoy = hoyEnColombia()
    const haceDosDias = moverDia(hoy, -2)
    const haceDiezDias = moverDia(hoy, -10)
    const desde7 = moverDia(hoy, -6)
    const desde30 = moverDia(hoy, -29)

    const api = abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('page_size=5')) return { cuerpo: paginaDe([ventaDeLista()]) }
        if (texto.includes(`date_from=${desde7}`)) {
          const pagina = Number(new URLSearchParams(texto.split('?')[1]).get('page') ?? 1)
          if (pagina === 1) {
            const lote = Array.from({ length: 200 }, (_, i) =>
              ventaDeLista({ id: 500 + i, total: 1000, created_at: `${haceDosDias}T14:00:00-05:00` }),
            )
            return { cuerpo: paginaDe(lote, { count: 201, next: 'x?page=2' }) }
          }
          // 23:40 en Colombia es 04:40 UTC del día siguiente: debe quedar en `hoy`, no fuera del rango.
          return {
            cuerpo: paginaDe(
              [ventaDeLista({ id: 901, total: 500000, created_at: `${moverDia(hoy, 1)}T04:40:00Z` })],
              { count: 201, next: null },
            ),
          }
        }
        if (texto.includes(`date_from=${desde30}`)) {
          return {
            cuerpo: paginaDe([
              ventaDeLista({ id: 950, total: 900000, created_at: `${haceDiezDias}T11:00:00-05:00` }),
              ventaDeLista({ id: 951, total: 500000, created_at: `${hoy}T16:00:00-05:00` }),
            ]),
          }
        }
        return { cuerpo: paginaDe([ventaDeLista({ id: 1, total: 500000, created_at: `${hoy}T16:00:00-05:00` })]) }
      },
    })

    const ritmo = await instrumento('Ritmo de ventas')
    await waitFor(() => expect(ritmo).toHaveTextContent(/\$\s?700\.000/))
    expect(within(ritmo).getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(ritmo).getByRole('img', { name: /Ritmo de ventas de los últimos 7 días/i })).toBeInTheDocument()
    expect(ritmo).toHaveTextContent(/\$\s?100\.000/)
    expect(ritmo).toHaveTextContent(/\$\s?500\.000/)
    expect(api.llamadas.filter((l) => l.clave.includes(`date_from=${desde7}`) && l.clave.includes('voided=false'))).toHaveLength(2)

    await userEvent.setup().click(within(ritmo).getByRole('button', { name: '30 días' }))
    expect(within(ritmo).getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(ritmo).toHaveTextContent(/\$\s?1\.400\.000/))
    expect(within(ritmo).getByRole('img', { name: /Ritmo de ventas de los últimos 30 días/i })).toBeInTheDocument()
    expect(api.llamadas.some((l) => l.clave.includes(`date_from=${desde30}`) && l.clave.includes(`date_to=${hoy}`))).toBe(true)
  })

  it('muestra el flujo de la caja de hoy separando entradas, salidas, efectivo y transferencias', async () => {
    abrir(
      dueno,
      {},
      {
        is_open: true,
        session: caja({
          summary: {
            by_kind: [
              { kind: 'sale', kind_label: 'Venta', cash: 400000, transfer: 200000 },
              { kind: 'consignee_payment', kind_label: 'Pago de consignación', cash: 80000, transfer: 0 },
              { kind: 'supplier_payment', kind_label: 'Abono a proveedor', cash: -150000, transfer: -50000 },
              { kind: 'mechanic_payment', kind_label: 'Pago a mecánico', cash: -90000, transfer: 0 },
            ],
            cash_total: 240000,
            transfer_total: 150000,
          },
        }),
      },
    )

    const flujo = await instrumento('Flujo de la caja de hoy')
    await waitFor(() => expect(flujo).toHaveTextContent(/\+\$\s?680\.000/))
    expect(flujo).toHaveTextContent(/-\$\s?290\.000/)
    expect(within(flujo).getByRole('img', { name: /Movimientos de la caja de hoy/i })).toBeInTheDocument()
    expect(flujo).toHaveTextContent('Abono a proveedor')
    expect(flujo).toHaveTextContent(/Efectivo neto:\s*\+\$\s?240\.000/)
    expect(flujo).toHaveTextContent(/Transferencias:\s*\+\$\s?150\.000/)
  })

  it('en el flujo de caja avisa cuando la caja está cerrada', async () => {
    abrir(dueno, {}, { is_open: false, session: null, suggested_opening_cash: 0 })

    const flujo = await instrumento('Flujo de la caja de hoy')
    await waitFor(() => expect(flujo).toHaveTextContent(/La caja está cerrada/))
  })

  it('cuando falta el resumen de caja no inventa ceros', async () => {
    abrir(dueno, {}, { is_open: true, session: caja({ summary: undefined }) })

    const cajaDeHoy = await instrumento('Caja de hoy')
    await waitFor(() => expect(cajaDeHoy).toHaveTextContent(/Resumen de cobros no disponible/))
    const flujo = await instrumento('Flujo de la caja de hoy')
    await waitFor(() => expect(flujo).toHaveTextContent(/resumen no está disponible/i))
  })

  it('si falla el ritmo de ventas, los demás paneles del tablero siguen operativos', async () => {
    const hoy = hoyEnColombia()
    const desde7 = moverDia(hoy, -6)
    abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        if (String(ruta).includes(`date_from=${desde7}`)) return errorDeApi(500, 'server_error', 'Falló.')
        return { cuerpo: paginaDe([ventaDeLista({ total: 125000 })]) }
      },
    })

    const ritmo = await instrumento('Ritmo de ventas')
    await waitFor(() => expect(ritmo).toHaveTextContent('No se pudo cargar'))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Ventas de hoy' })).toHaveTextContent(/\$\s?125\.000/))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Flujo de la caja de hoy' })).toHaveTextContent(/\+\$\s?43\.000/))
  })
})

describe('productos que se están acabando', () => {
  const agotado = producto({ id: 3, code: 'ELE-BUJ', name: 'Bujía NGK', stock: 0, min_stock: 4, is_low_stock: true })
  const casi = producto({ id: 4, code: 'MO-FIL', name: 'Filtro de aceite', stock: 1, min_stock: 2, is_low_stock: true })
  const justo = producto({ id: 5, code: 'FRE-PAS', name: 'Pastillas de freno', stock: 3, min_stock: 3, is_low_stock: true })
  const bien = producto({ id: 6, code: 'FRE-ZAP', name: 'Zapatas traseras', stock: 9, min_stock: 2, is_low_stock: false })

  it('recorre todo el catálogo y muestra primero lo más urgente', async () => {
    const api = abrir(dueno, {
      'GET /products*': (_, ruta) => {
        const pagina = Number(new URLSearchParams(String(ruta).split('?')[1]).get('page') ?? 1)
        return pagina === 1
          ? { cuerpo: paginaDe([justo, bien], { count: 4, next: 'siguiente' }) }
          : { cuerpo: paginaDe([casi, agotado], { count: 4, previous: 'anterior' }) }
      },
    })

    const panel = await screen.findByRole('region', { name: 'Se están acabando' })
    await waitFor(() => expect(panel).toHaveTextContent('3 por reponer'))
    const filas = within(panel).getAllByRole('listitem')
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringMatching(/Bujía NGK.*Agotado/),
      expect.stringMatching(/Filtro de aceite.*1 \/ 2/),
      expect.stringMatching(/Pastillas de freno.*3 \/ 3/),
    ])
    expect(panel).not.toHaveTextContent('Zapatas traseras')
    expect(within(panel).getByRole('link', { name: /Ver productos/ })).toHaveAttribute('href', '/inventario/productos')
    const paginas = api.llamadas.filter((l) => l.clave.startsWith('GET /products?')).map((l) => l.clave)
    expect(paginas).toEqual(['GET /products?page_size=200', 'GET /products?page=2&page_size=200'])
  })

  it('si nada está en su mínimo lo dice', async () => {
    abrir(dueno, { 'GET /products*': () => ({ cuerpo: paginaDe([bien]) }) })

    const panel = await screen.findByRole('region', { name: 'Se están acabando' })
    expect(await within(panel).findByText('Ningún producto está en su mínimo.')).toBeInTheDocument()
  })

  it('con muchos por reponer muestra los primeros y cuántos faltan', async () => {
    const muchos = Array.from({ length: 9 }, (_, i) =>
      producto({ id: 10 + i, code: `P-${i}`, name: `Producto ${i}`, stock: i, min_stock: 10, is_low_stock: true }),
    )
    abrir(dueno, { 'GET /products*': () => ({ cuerpo: paginaDe(muchos) }) })

    const panel = await screen.findByRole('region', { name: 'Se están acabando' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(6))
    expect(panel).toHaveTextContent('y 3 más')
  })
})

describe('inicio del vendedor', () => {
  it('no ve caja, mecánicos ni cuentas, y no los pide', async () => {
    const api = abrir(vendedor)

    expect(screen.getByRole('heading', { level: 1, name: /Ana Ruiz/ })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Ventas de hoy' })
    expect(screen.queryByRole('region', { name: 'Caja de hoy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuentas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ritmo de ventas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Flujo de la caja de hoy' })).not.toBeInTheDocument()
    const pedidas = api.llamadas.map((l) => l.clave)
    expect(pedidas.some((c) => c.startsWith('GET /mechanic-settlements'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /suppliers'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /consignees'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /sales?') && c.includes('voided=false'))).toBe(false)
    expect(screen.queryByRole('region', { name: 'Se están acabando' })).not.toBeInTheDocument()
    expect(pedidas.some((c) => c.startsWith('GET /products?'))).toBe(false)
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
