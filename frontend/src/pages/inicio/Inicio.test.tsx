import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrentCash, DailySettlement, Sale, SaleReturn } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { caja, compra, devolucion, local, paginaDe, producto, proveedor, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'
import { diaEnColombia, hoyEnColombia, moverDia } from '../../utilidades/fechas'
import { saludoSegunHora } from '../../utilidades/saludo'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Una venta de la lista (sin líneas), por defecto de hoy a las 10 a. m. en Colombia. */
function ventaDeLista(cambios: Partial<Sale> = {}): Sale {
  const { items: _i, services: _s, payments: _p, notes: _n, voided_at: _va, voided_by: _vb, void_reason: _vr, ...lista } = venta()
  return { ...lista, created_at: `${hoyEnColombia()}T10:15:00-05:00`, ...cambios }
}

const LIQUIDACION: DailySettlement = {
  date: '2026-11-08',
  total: 186000,
  mechanics: [
    { mechanic: { id: 1, name: 'Pedro' }, services_count: 7, labor_total: 200000, percentage: 60, share: 120000, deductions_total: 0, amount: 120000 },
    { mechanic: { id: 2, name: 'Luis' }, services_count: 4, labor_total: 110000, percentage: 60, share: 66000, deductions_total: 0, amount: 66000 },
  ],
}

function abrir(usuario: typeof dueno, rutas: Parameters<typeof simularApi>[0] = {}, actual: CurrentCash = { is_open: true, session: caja({ opened_at: `${hoyEnColombia()}T08:00:00-05:00` }) }) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: actual }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /sales*': () => ({ cuerpo: paginaDe([ventaDeLista()]) }),
    'GET /sale-returns*': () => ({ cuerpo: paginaDe([]) }),
    'GET /purchases*': () => ({ cuerpo: paginaDe([]) }),
    'GET /products*': () => ({ cuerpo: paginaDe([]) }),
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
  it('muestra el título «Así va tu negocio», la fecha de Colombia y las acciones principales sin hora común si algo falla', async () => {
    abrir(dueno, { 'GET /suppliers*': () => errorDeApi(500, 'server_error', 'Falló.') })

    expect(screen.getByRole('heading', { level: 1, name: 'Así va tu negocio' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nueva venta/ })).toHaveAttribute('href', '/venta/vender')
    expect(screen.getByRole('link', { name: 'Recibir compra' })).toHaveAttribute('href', '/compras/lista')
    const cuentas = await instrumento('Cuentas del negocio')
    await waitFor(() => expect(cuentas).toHaveTextContent(/No se pudieron cargar los proveedores/))
    expect(screen.queryByText(/Datos a las/)).not.toBeInTheDocument()
  })

  it('avisa antes de los indicadores cuando la caja sigue abierta desde ayer en calendario de Colombia', async () => {
    const hoy = hoyEnColombia()
    // 23:30 de ayer en Colombia = 04:30Z de hoy en UTC: debe detectarse como abierta desde ayer.
    abrir(dueno, {}, { is_open: true, session: caja({ opened_at: `${hoy}T04:30:00Z` }) })

    const aviso = await screen.findByRole('status')
    expect(aviso).toHaveTextContent('La caja sigue abierta desde ayer')
    expect(within(aviso).getByRole('link', { name: 'Revisar caja' })).toHaveAttribute('href', '/caja/actual')
  })

  it('no muestra aviso de cierre atrasado cuando la caja abrió hoy en Colombia', async () => {
    const hoy = hoyEnColombia()
    abrir(dueno, {}, { is_open: true, session: caja({ opened_at: `${hoy}T08:00:00-05:00` }) })

    await instrumento('Vendido hoy')
    expect(screen.queryByText(/La caja sigue abierta desde/)).not.toBeInTheDocument()
  })

  it('presenta la franja de ventas de hoy y del mes con sus referencias reales, sin porcentajes y con filtros exactos', async () => {
    const hoy = hoyEnColombia()
    const ayer = moverDia(hoy, -1)
    abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('page_size=5')) {
          return { cuerpo: paginaDe([ventaDeLista({ id: 1, total: 2000000 }), ventaDeLista({ id: 2, total: 415000 })]) }
        }
        if (!texto.includes(`date_to=${hoy}`)) {
          return { cuerpo: paginaDe([ventaDeLista({ id: 99, total: 1850000 })]) }
        }
        return {
          cuerpo: paginaDe([
            ventaDeLista({ id: 1, total: 2000000, created_at: `${hoy}T09:15:00-05:00` }),
            ventaDeLista({ id: 2, total: 415000, created_at: `${hoy}T11:20:00-05:00` }),
            ventaDeLista({ id: 3, total: 980000, created_at: `${ayer}T16:00:00-05:00` }),
          ]),
        }
      },
    })

    const vendidoHoy = await instrumento('Vendido hoy')
    await waitFor(() => expect(vendidoHoy).toHaveTextContent(/\$\s?2\.415\.000/))
    expect(vendidoHoy).toHaveTextContent('2 ventas vigentes · Día en curso')
    expect(vendidoHoy).toHaveTextContent(/Ayer completo.*\$\s?980\.000/)
    expect(within(vendidoHoy).getByRole('link', { name: 'Ver ventas de hoy' })).toHaveAttribute(
      'href',
      '/venta/historial?periodo=hoy&voided=false',
    )

    const vendidoMes = await instrumento('Vendido este mes')
    await waitFor(() => expect(vendidoMes).toHaveTextContent(/\$\s?3\.395\.000/))
    await waitFor(() => expect(vendidoMes).toHaveTextContent(/\$\s?1\.850\.000/))
    expect(vendidoMes).not.toHaveTextContent(/%/)
    expect(within(vendidoMes).getByRole('link', { name: 'Ver ventas del mes' })).toHaveAttribute(
      'href',
      '/venta/historial?periodo=mes&voided=false',
    )
    expect(screen.getByText(/Ventas sin anuladas\. Devoluciones aparte\./)).toBeInTheDocument()
  })

  it('suma las ventas de todas las páginas y nunca muestra un total parcial si falla la página 2; un fallo del mes anterior queda aislado', async () => {
    const hoy = hoyEnColombia()
    let fallarMesAnterior = true
    let fallarPaginaDosActual = false

    const api = abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('page_size=5')) return { cuerpo: paginaDe([ventaDeLista()], { count: 403 }) }
        if (!texto.includes(`date_to=${hoy}`)) {
          return fallarMesAnterior
            ? errorDeApi(500, 'server_error', 'Falló mes anterior.')
            : { cuerpo: paginaDe([ventaDeLista({ total: 500000 })]) }
        }
        const pagina = Number(new URLSearchParams(texto.split('?')[1]).get('page') ?? 1)
        if (pagina === 2 && fallarPaginaDosActual) return errorDeApi(500, 'server_error', 'Falló p2.')
        const cuantas = pagina < 3 ? 200 : 3
        const ventas = Array.from({ length: cuantas }, (_, i) => ventaDeLista({ id: pagina * 1000 + i, total: 1000 }))
        return { cuerpo: paginaDe(ventas, { count: 403, next: pagina < 3 ? `x?page=${pagina + 1}` : null }) }
      },
    })

    const vendidoHoy = await instrumento('Vendido hoy')
    await waitFor(() => expect(vendidoHoy).toHaveTextContent('403 ventas vigentes'))
    expect(vendidoHoy).toHaveTextContent(/\$\s?403\.000/)

    const vendidoMes = await instrumento('Vendido este mes')
    expect(vendidoMes).toHaveTextContent(/\$\s?403\.000/)
    await waitFor(() => expect(vendidoMes).toHaveTextContent(/No se pudo comparar/))
    expect(api.llamadas.filter((l) => l.clave.startsWith('GET /sales?') && l.clave.includes(`date_to=${hoy}`) && l.clave.includes('voided=false'))).toHaveLength(3)

    // Si falla una página posterior al reintentar el panorama actual, no muestra $ 200.000 parciales.
    fallarPaginaDosActual = true
    fallarMesAnterior = false
    abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('page_size=5')) return { cuerpo: paginaDe([ventaDeLista()]) }
        if (!texto.includes(`date_to=${hoy}`)) return { cuerpo: paginaDe([ventaDeLista({ total: 500000 })]) }
        const pagina = Number(new URLSearchParams(texto.split('?')[1]).get('page') ?? 1)
        if (pagina === 1) {
          const lote = Array.from({ length: 200 }, (_, i) => ventaDeLista({ id: i + 1, total: 1000 }))
          return { cuerpo: paginaDe(lote, { count: 250, next: 'x?page=2' }) }
        }
        return errorDeApi(500, 'server_error', 'Falló p2.')
      },
    })
    const regionesHoy = await screen.findAllByRole('region', { name: 'Vendido hoy' })
    const segundaHoy = regionesHoy[regionesHoy.length - 1]
    await waitFor(() => expect(segundaHoy).toHaveTextContent(/No se pudieron cargar las ventas/))
    expect(segundaHoy).not.toHaveTextContent(/\$\s?200\.000/)
  })

  it('muestra «Cómo vienen las ventas» en 7 días y cambia a «Este mes» reutilizando la consulta compartida', async () => {
    const hoy = hoyEnColombia()
    const ayer = moverDia(hoy, -1)

    const api = abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('page_size=5')) return { cuerpo: paginaDe([ventaDeLista()]) }
        if (!texto.includes(`date_to=${hoy}`)) return { cuerpo: paginaDe([]) }
        const pagina = Number(new URLSearchParams(texto.split('?')[1]).get('page') ?? 1)
        if (pagina === 1) {
          const lote = Array.from({ length: 200 }, (_, i) =>
            ventaDeLista({ id: 500 + i, total: 1000, created_at: `${ayer}T14:00:00-05:00` }),
          )
          return { cuerpo: paginaDe(lote, { count: 201, next: 'x?page=2' }) }
        }
        // 23:40 de hoy en Colombia = 04:40 UTC de mañana.
        return {
          cuerpo: paginaDe([ventaDeLista({ id: 901, total: 500000, created_at: `${moverDia(hoy, 1)}T04:40:00Z` })], {
            count: 201,
            next: null,
          }),
        }
      },
    })

    const tendencia = await instrumento('Cómo vienen las ventas')
    await waitFor(() => expect(tendencia).toHaveTextContent(/\$\s?700\.000/))
    expect(within(tendencia).getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(tendencia).getByRole('img', { name: /Cómo vienen las ventas.*Hoy sigue en curso/i })).toBeInTheDocument()
    expect(tendencia).toHaveTextContent(/repuestos y servicios/i)

    const llamadasAntes = api.llamadas.filter((l) => l.clave.includes('voided=false')).length
    await userEvent.setup().click(within(tendencia).getByRole('button', { name: 'Este mes' }))
    expect(within(tendencia).getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true')
    const llamadasDespues = api.llamadas.filter((l) => l.clave.includes('voided=false')).length
    expect(llamadasDespues).toBe(llamadasAntes)
  })

  it('las cuentas del negocio incluyen terceros desactivados, separan saldos y permiten reintentar por separado', async () => {
    const api = abrir(dueno)

    const cuentas = await instrumento('Cuentas del negocio')
    await waitFor(() => expect(cuentas).toHaveTextContent(/Debo a proveedores.*\$\s?3\.920\.000/))
    expect(cuentas).toHaveTextContent(/2 proveedores con saldo/)
    expect(cuentas).toHaveTextContent(/Me deben los locales.*\$\s?640\.000/)
    expect(cuentas).toHaveTextContent(/1 local con saldo/)
    expect(within(cuentas).getByRole('link', { name: 'Ver proveedores' })).toHaveAttribute('href', '/compras/proveedores')
    expect(within(cuentas).getByRole('link', { name: 'Ver locales' })).toHaveAttribute('href', '/consignacion/locales')

    const pedidas = api.llamadas.map((l) => l.clave).filter((c) => c.startsWith('GET /suppliers') || c.startsWith('GET /consignees'))
    expect(pedidas.every((c) => c.includes('include_inactive=true') && c.includes('with_debt=true'))).toBe(true)
  })

  it('si falla una consulta, los demás bloques del tablero siguen operativos', async () => {
    const hoy = hoyEnColombia()
    abrir(dueno, {
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('page_size=5')) return { cuerpo: paginaDe([ventaDeLista({ total: 125000 })]) }
        if (texto.includes(`date_to=${hoy}`)) return errorDeApi(500, 'server_error', 'Falló.')
        return { cuerpo: paginaDe([]) }
      },
    })

    const tendencia = await instrumento('Cómo vienen las ventas')
    await waitFor(() => expect(tendencia).toHaveTextContent(/No se pudieron cargar las ventas/))
    const cuentas = await instrumento('Cuentas del negocio')
    await waitFor(() => expect(cuentas).toHaveTextContent(/\$\s?3\.920\.000/))
    const tabla = await screen.findByRole('table', { name: 'Últimas ventas de hoy' })
    expect(tabla).toHaveTextContent(/\$\s?125\.000/)
  })

  it('las últimas ventas muestran las anuladas tachadas y abren el recibo en ventana emergente', async () => {
    abrir(dueno, {
      'GET /sales*': () => ({
        cuerpo: paginaDe([
          ventaDeLista({ id: 12, number: 412, customer: null, services_count: 1, items_count: 2 }),
          ventaDeLista({ id: 11, number: 411, is_voided: true }),
        ]),
      }),
      'GET /sales/12': () => ({ cuerpo: venta({ id: 12, number: 412 }) }),
    })

    const tabla = await screen.findByRole('table', { name: 'Últimas ventas de hoy' })
    const [, primera, anulada] = await within(tabla).findAllByRole('row')
    expect(primera).toHaveTextContent('Sin cliente')
    expect(primera).toHaveTextContent('2 + taller')
    expect(anulada).toHaveClass('tabla__fila--anulada')

    await userEvent.setup().click(within(primera).getByRole('button', { name: '#0412' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Venta n.º 412' })
    expect(dialogo).toBeInTheDocument()
  })

  it('Ctrl+N abre Vender', async () => {
    abrir(dueno)

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(await screen.findByRole('region', { name: 'Productos de la venta' })).toBeInTheDocument()
  })

  it('muestra la caja con efectivo esperado, base y aclaración de transferencias, o cerrada y sin inventar ceros en error', async () => {
    const hoy = hoyEnColombia()
    abrir(
      dueno,
      {},
      { is_open: true, session: caja({ expected_cash: 1284000, opening_cash: 200000, opened_at: `${hoy}T08:00:00-05:00` }) },
    )

    const panelCaja = await instrumento('Caja')
    await waitFor(() => expect(panelCaja).toHaveTextContent(/\$\s?1\.284\.000/))
    expect(panelCaja).toHaveTextContent('Efectivo esperado en el cajón')
    expect(panelCaja).toHaveTextContent(/Base de apertura.*\$\s?200\.000/)
    expect(panelCaja).toHaveTextContent(/transferencias van fuera del cajón/i)
    expect(panelCaja).not.toHaveTextContent(/efec\.|transf\./i)
    expect(within(panelCaja).getByRole('link', { name: 'Ver caja' })).toHaveAttribute('href', '/caja/actual')
  })

  it('con la caja cerrada ofrece abrirla y ante error no inventa $ 0', async () => {
    abrir(dueno, {}, { is_open: false, session: null, suggested_opening_cash: 0 })
    const cerrada = await instrumento('Caja')
    await waitFor(() => expect(cerrada).toHaveTextContent('La caja está cerrada'))
    expect(within(cerrada).getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja/actual')

    abrir(dueno, { 'GET /cash-sessions/current': () => errorDeApi(500, 'server_error', 'Falló caja.') })
    const cajas = await screen.findAllByRole('region', { name: 'Caja' })
    const conError = cajas[cajas.length - 1]
    await waitFor(() => expect(conError).toHaveTextContent('No se pudo consultar la caja'))
    expect(conError).not.toHaveTextContent(/\$\s?0/)
    expect(within(conError).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('ordena «Necesita tu atención» por categorías, cuenta mecánico con neto $ 0 y pide borradores sin fecha', async () => {
    const api = abrir(dueno, {
      'GET /products*': () => ({
        cuerpo: paginaDe([producto({ id: 1, stock: 0, min_stock: 3, is_low_stock: true })]),
      }),
      'GET /mechanic-settlements/daily*': () => ({
        cuerpo: {
          date: hoyEnColombia(),
          total: 0,
          mechanics: [
            {
              mechanic: { id: 1, name: 'Pedro' },
              services_count: 2,
              labor_total: 50000,
              percentage: 60,
              share: 30000,
              deductions_total: 30000,
              amount: 0,
            },
          ],
        },
      }),
      'GET /purchases*': () => ({
        cuerpo: paginaDe([compra({ status: 'draft', status_label: 'Borrador' })], { count: 4 }),
      }),
    })

    const atencion = await instrumento('Necesita tu atención')
    await waitFor(() => expect(atencion).toHaveTextContent('3 asuntos'))
    const filas = within(atencion).getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent(/1 producto agotado/i)
    expect(within(filas[0]).getByRole('link', { name: 'Revisar productos' })).toHaveAttribute('href', '/inventario/productos')
    expect(filas[1]).toHaveTextContent(/1 mecánico de hoy por liquidar/i)
    expect(filas[1]).toHaveTextContent(/\$\s?0 neto por descuentos.*2 servicios/)
    expect(within(filas[1]).getByRole('link', { name: 'Liquidar' })).toHaveAttribute('href', '/taller/liquidacion')
    expect(filas[2]).toHaveTextContent(/4 compras en borrador/i)
    expect(within(filas[2]).getByRole('link', { name: 'Revisar borradores' })).toHaveAttribute(
      'href',
      '/compras/lista?status=draft&periodo=todas',
    )

    const llamadaBorradores = api.llamadas.find((l) => l.clave.startsWith('GET /purchases?'))?.clave ?? ''
    expect(llamadaBorradores).toContain('status=draft')
    expect(llamadaBorradores).toContain('page_size=1')
    expect(llamadaBorradores).not.toContain('date_from')
    expect(llamadaBorradores).not.toContain('date_to')
  })

  it('dice «Sin pendientes de operación» solo cuando las tres consultas terminan sin error, y avisa si falla existencias', async () => {
    abrir(dueno, {
      'GET /products*': () => ({ cuerpo: paginaDe([producto({ stock: 8, min_stock: 2, is_low_stock: false })]) }),
      'GET /mechanic-settlements/daily*': () => ({ cuerpo: { date: hoyEnColombia(), total: 0, mechanics: [] } }),
      'GET /purchases*': () => ({ cuerpo: paginaDe([], { count: 0 }) }),
    })

    const limpia = await instrumento('Necesita tu atención')
    await waitFor(() => expect(limpia).toHaveTextContent('Sin pendientes de operación'))
    expect(limpia).toHaveTextContent(/productos en mínimo, mecánicos de hoy y compras en borrador/i)

    abrir(dueno, {
      'GET /products*': () => errorDeApi(500, 'server_error', 'Falló catálogo.'),
      'GET /mechanic-settlements/daily*': () => ({ cuerpo: { date: hoyEnColombia(), total: 0, mechanics: [] } }),
      'GET /purchases*': () => ({ cuerpo: paginaDe([], { count: 0 }) }),
    })
    const panelesAtencion = await screen.findAllByRole('region', { name: 'Necesita tu atención' })
    const conFallo = panelesAtencion[panelesAtencion.length - 1]
    await waitFor(() => expect(conFallo).toHaveTextContent('No se pudieron consultar las existencias'))
    expect(conFallo).not.toHaveTextContent('Sin pendientes de operación')
    expect(within(conFallo).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()

    const panelesExistencias = await screen.findAllByRole('region', { name: 'Existencias por reponer' })
    const existenciasConFallo = panelesExistencias[panelesExistencias.length - 1]
    await waitFor(() => expect(existenciasConFallo).toHaveTextContent('No se pudieron consultar las existencias'))
    expect(within(existenciasConFallo).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('suma todas las páginas de devoluciones de hoy sin restarlas de «Vendido hoy» y confirma cuando hay cero', async () => {
    const devolverLista = (id: number, total: number): SaleReturn => {
      const { items: _i, services: _s, refunds: _r, mechanic_deduction: _m, ...base } = devolucion({ id, total })
      return base
    }

    abrir(dueno, {
      'GET /sales*': () => ({ cuerpo: paginaDe([ventaDeLista({ total: 500000 })]) }),
      'GET /sale-returns*': (_, ruta) => {
        const pagina = Number(new URLSearchParams(String(ruta).split('?')[1]).get('page') ?? 1)
        if (pagina === 1) {
          const lote = Array.from({ length: 200 }, (_, i) => devolverLista(i + 1, 1000))
          return { cuerpo: paginaDe(lote, { count: 202, next: 'x?page=2' }) }
        }
        return { cuerpo: paginaDe([devolverLista(201, 15000), devolverLista(202, 20000)], { count: 202, next: null }) }
      },
    })

    const panelDevoluciones = await instrumento('Devoluciones de hoy')
    await waitFor(() => expect(panelDevoluciones).toHaveTextContent(/\$\s?235\.000/))
    expect(panelDevoluciones).toHaveTextContent('202 devoluciones registradas hoy')
    expect(panelDevoluciones).toHaveTextContent(/fechas anteriores/i)
    expect(within(panelDevoluciones).getByRole('link', { name: 'Ver devoluciones' })).toHaveAttribute(
      'href',
      '/venta/devoluciones?periodo=hoy',
    )
    const vendidoHoy = await instrumento('Vendido hoy')
    expect(vendidoHoy).toHaveTextContent(/\$\s?500\.000/)

    abrir(dueno, { 'GET /sale-returns*': () => ({ cuerpo: paginaDe([]) }) })
    const paneles = await screen.findAllByRole('region', { name: 'Devoluciones de hoy' })
    const vacio = paneles[paneles.length - 1]
    await waitFor(() => expect(vacio).toHaveTextContent('No hay devoluciones hoy.'))
  })

  it('identifica como «Último dato válido» un bloque cuya recarga falla y no muestra conteos viejos como actuales en atención', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let fallarRecarga = false
      abrir(dueno, {
        'GET /suppliers*': () =>
          fallarRecarga ? errorDeApi(500, 'server_error', 'Falló recarga.') : { cuerpo: [proveedor({ balance_due: 900000 })] },
        'GET /mechanic-settlements/daily*': () =>
          fallarRecarga
            ? errorDeApi(500, 'server_error', 'Falló taller.')
            : {
                cuerpo: {
                  date: hoyEnColombia(),
                  total: 60000,
                  mechanics: [
                    {
                      mechanic: { id: 1, name: 'Pedro' },
                      services_count: 1,
                      labor_total: 100000,
                      percentage: 60,
                      share: 60000,
                      deductions_total: 0,
                      amount: 60000,
                    },
                  ],
                },
              },
      })

      const cuentas = await instrumento('Cuentas del negocio')
      await waitFor(() => expect(cuentas).toHaveTextContent(/\$\s?900\.000/))
      const atencion = await instrumento('Necesita tu atención')
      await waitFor(() => expect(atencion).toHaveTextContent(/1 mecánico de hoy por liquidar/i))

      fallarRecarga = true
      await vi.advanceTimersByTimeAsync(61_000)

      await waitFor(() => expect(cuentas).toHaveTextContent(/Último dato válido:/))
      expect(cuentas).toHaveTextContent(/\$\s?900\.000/)
      await waitFor(() => expect(atencion).toHaveTextContent('No se pudo consultar la liquidación de hoy'))
      expect(atencion).not.toHaveTextContent(/1 mecánico de hoy por liquidar/i)
      expect(screen.queryByText(/Datos a las/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('en área angosta (< 960px) pasa a una columna colocando «Necesita tu atención» antes de la tendencia y de las últimas ventas', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private cb: ResizeObserverCallback
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb
        }
        observe(target: Element) {
          if (target.id === 'contenido') {
            this.cb([{ contentRect: { width: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
          }
        }
        unobserve() {}
        disconnect() {}
      },
    )

    abrir(dueno)

    const atencion = await instrumento('Necesita tu atención')
    const tendencia = await instrumento('Cómo vienen las ventas')
    const cuentas = await instrumento('Cuentas del negocio')
    const panelCaja = await instrumento('Caja')
    const existencias = await instrumento('Existencias por reponer')
    const devoluciones = await instrumento('Devoluciones de hoy')
    const ultimas = await screen.findByRole('table', { name: 'Últimas ventas de hoy' })

    const sigueDespues = (primero: Element, segundo: Element) =>
      Boolean(primero.compareDocumentPosition(segundo) & Node.DOCUMENT_POSITION_FOLLOWING)

    expect(sigueDespues(atencion, tendencia)).toBe(true)
    expect(sigueDespues(tendencia, cuentas)).toBe(true)
    expect(sigueDespues(cuentas, panelCaja)).toBe(true)
    expect(sigueDespues(panelCaja, existencias)).toBe(true)
    expect(sigueDespues(existencias, devoluciones)).toBe(true)
    expect(sigueDespues(devoluciones, ultimas)).toBe(true)
  })
})

describe('existencias por reponer', () => {
  const agotado = producto({ id: 3, code: 'ELE-BUJ', name: 'Bujía NGK', stock: 0, min_stock: 4, is_low_stock: true })
  const casi = producto({ id: 4, code: 'MO-FIL', name: 'Filtro de aceite', stock: 1, min_stock: 2, is_low_stock: true })
  const justo = producto({ id: 5, code: 'FRE-PAS', name: 'Pastillas de freno', stock: 3, min_stock: 3, is_low_stock: true })
  const bien = producto({ id: 6, code: 'FRE-ZAP', name: 'Zapatas traseras', stock: 9, min_stock: 2, is_low_stock: false })

  it('recorre todo el catálogo, separa agotados de existencia baja sin doble conteo y muestra la hora de revisión', async () => {
    const api = abrir(dueno, {
      'GET /products*': (_, ruta) => {
        const pagina = Number(new URLSearchParams(String(ruta).split('?')[1]).get('page') ?? 1)
        return pagina === 1
          ? { cuerpo: paginaDe([justo, bien], { count: 4, next: 'siguiente' }) }
          : { cuerpo: paginaDe([casi, agotado], { count: 4, previous: 'anterior' }) }
      },
    })

    const panel = await screen.findByRole('region', { name: 'Existencias por reponer' })
    await waitFor(() => expect(panel).toHaveTextContent('1 agotado'))
    expect(panel).toHaveTextContent('2 con existencia baja')
    expect(panel).toHaveTextContent(/Revisado a las/)
    const filas = within(panel).getAllByRole('listitem')
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringMatching(/Bujía NGK.*Agotado/),
      expect.stringMatching(/Filtro de aceite.*1 \/ mínimo 2/),
      expect.stringMatching(/Pastillas de freno.*3 \/ mínimo 3/),
    ])
    expect(panel).not.toHaveTextContent('Zapatas traseras')
    expect(within(panel).getByRole('link', { name: /Ver productos/ })).toHaveAttribute('href', '/inventario/productos')
    const paginas = api.llamadas.filter((l) => l.clave.startsWith('GET /products?')).map((l) => l.clave)
    expect(paginas).toEqual(['GET /products?page_size=200', 'GET /products?page=2&page_size=200'])
  })

  it('si nada está en su mínimo lo dice y no existe panel «Ir a»', async () => {
    abrir(dueno, { 'GET /products*': () => ({ cuerpo: paginaDe([bien]) }) })

    const panel = await screen.findByRole('region', { name: 'Existencias por reponer' })
    expect(await within(panel).findByText('Ningún producto activo está en su mínimo.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Ir a' })).not.toBeInTheDocument()
  })

  it('con muchos por reponer muestra los primeros seis y cuántos faltan', async () => {
    const muchos = Array.from({ length: 9 }, (_, i) =>
      producto({ id: 10 + i, code: `P-${i}`, name: `Producto ${i}`, stock: i, min_stock: 10, is_low_stock: true }),
    )
    abrir(dueno, { 'GET /products*': () => ({ cuerpo: paginaDe(muchos) }) })

    const panel = await screen.findByRole('region', { name: 'Existencias por reponer' })
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(6))
    expect(panel).toHaveTextContent('y 3 más')
  })
})

describe('inicio del vendedor', () => {
  it('no ve caja, mecánicos, cuentas, atención, existencias ni devoluciones, y no los pide', async () => {
    const api = abrir(vendedor)

    expect(screen.getByRole('heading', { level: 1, name: /Ana Ruiz/ })).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Ventas de hoy' })
    expect(screen.queryByRole('region', { name: 'Caja' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuentas del negocio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cómo vienen las ventas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Necesita tu atención' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Existencias por reponer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Devoluciones de hoy' })).not.toBeInTheDocument()
    const pedidas = api.llamadas.map((l) => l.clave)
    expect(pedidas.some((c) => c.startsWith('GET /mechanic-settlements'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /suppliers'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /consignees'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /sales?') && c.includes('voided=false'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /products?'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /purchases'))).toBe(false)
    expect(pedidas.some((c) => c.startsWith('GET /sale-returns'))).toBe(false)
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
