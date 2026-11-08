import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearClienteDeConsultas } from '../api/consultas'
import type { Sale, SaleReturn } from '../api/types'
import { errorDeApi, simularApi } from '../test/apiSimulada'
import { devolucion, paginaDe, venta } from '../test/datos'
import { useDevolucionesDeHoy, usePanoramaDeVentas } from './usePanoramaDeVentas'

afterEach(() => {
  vi.unstubAllGlobals()
})

function envoltura() {
  const cliente = crearClienteDeConsultas()
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  )
}

function ventaLista(cambios: Partial<Sale> = {}): Sale {
  const { items: _i, services: _s, payments: _p, notes: _n, voided_at: _va, voided_by: _vb, void_reason: _vr, ...resto } = venta()
  return { ...resto, ...cambios }
}

function devolucionLista(cambios: Partial<SaleReturn> = {}): SaleReturn {
  const { items: _i, services: _s, refunds: _r, mechanic_deduction: _m, ...resto } = devolucion()
  return { ...resto, ...cambios }
}

describe('usePanoramaDeVentas y useDevolucionesDeHoy', () => {
  it('recorre todas las páginas una sola vez para hoy, ayer, 7 días y este mes agrupando en hora de Colombia', async () => {
    // 3 de noviembre: 7 días arranca el 28 de octubre (< inicio de mes 2026-11-01).
    const hoy = '2026-11-03'
    const api = simularApi({
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('date_from=2026-10-01')) {
          return {
            cuerpo: paginaDe([ventaLista({ id: 90, total: 800000, created_at: '2026-10-02T12:00:00-05:00' })]),
          }
        }
        const pagina = Number(new URLSearchParams(texto.split('?')[1]).get('page') ?? 1)
        if (pagina === 1) {
          const lote = Array.from({ length: 200 }, (_, i) =>
            ventaLista({ id: 100 + i, total: 1000, created_at: '2026-10-30T11:00:00-05:00' }),
          )
          return { cuerpo: paginaDe(lote, { count: 203, next: 'x?page=2' }) }
        }
        return {
          cuerpo: paginaDe(
            [
              ventaLista({ id: 401, total: 90000, created_at: '2026-11-01T15:00:00-05:00' }),
              ventaLista({ id: 402, total: 140000, created_at: '2026-11-02T17:00:00-05:00' }),
              // 23:30 del 3 de noviembre en Colombia = 04:30Z del 4 de noviembre en UTC.
              ventaLista({ id: 403, total: 310000, created_at: '2026-11-04T04:30:00Z' }),
            ],
            { count: 203, next: null },
          ),
        }
      },
    })

    const { result } = renderHook(() => usePanoramaDeVentas(hoy), { wrapper: envoltura() })
    await waitFor(() => expect(result.current.actual.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.mesAnterior.isSuccess).toBe(true))

    const datos = result.current.actual.data!
    expect(datos.hoy).toEqual({ fecha: '2026-11-03', total: 310000, cantidad: 1 })
    expect(datos.ayer).toEqual({ fecha: '2026-11-02', total: 140000, cantidad: 1 })
    expect(datos.sieteDias.total).toBe(200000 + 90000 + 140000 + 310000)
    expect(datos.sieteDias.cantidad).toBe(203)
    expect(datos.mes.desde).toBe('2026-11-01')
    expect(datos.mes.total).toBe(90000 + 140000 + 310000)
    expect(datos.mes.cantidad).toBe(3)
    expect(datos.mes.mejorDia?.fecha).toBe('2026-11-03')
    expect(result.current.mesAnterior.data).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-03',
      total: 800000,
      cantidad: 1,
    })
    expect(api.llamadas.filter((l) => l.clave.includes('date_from=2026-10-28'))).toHaveLength(2)
  })

  it('falla completa sin entregar suma parcial si falla la segunda página de ventas o si solo falla el mes anterior aísla el error', async () => {
    simularApi({
      'GET /sales*': (_, ruta) => {
        const texto = String(ruta)
        if (texto.includes('date_from=2026-10-01')) return errorDeApi(500, 'server_error', 'Falló mes previo.')
        const pagina = Number(new URLSearchParams(texto.split('?')[1]).get('page') ?? 1)
        if (pagina === 1) {
          return { cuerpo: paginaDe([ventaLista({ total: 50000, created_at: '2026-11-08T10:00:00-05:00' })], { count: 250, next: 'x?page=2' }) }
        }
        return errorDeApi(500, 'server_error', 'Falló página 2.')
      },
    })

    const { result } = renderHook(() => usePanoramaDeVentas('2026-11-08'), { wrapper: envoltura() })
    await waitFor(() => expect(result.current.actual.isError).toBe(true))
    expect(result.current.actual.data).toBeUndefined()

    simularApi({
      'GET /sales*': (_, ruta) => {
        if (String(ruta).includes('date_from=2026-10-01')) return errorDeApi(500, 'server_error', 'Falló mes previo.')
        return { cuerpo: paginaDe([ventaLista({ total: 175000, created_at: '2026-11-08T10:00:00-05:00' })]) }
      },
    })
    const aislado = renderHook(() => usePanoramaDeVentas('2026-11-08'), { wrapper: envoltura() })
    await waitFor(() => expect(aislado.result.current.actual.isSuccess).toBe(true))
    await waitFor(() => expect(aislado.result.current.mesAnterior.isError).toBe(true))
    expect(aislado.result.current.actual.data?.mes.total).toBe(175000)
  })

  it('recorre todas las páginas de devoluciones del día y falla completa si falla una página posterior', async () => {
    let fallarPagina2 = false
    simularApi({
      'GET /sale-returns*': (_, ruta) => {
        const pagina = Number(new URLSearchParams(String(ruta).split('?')[1]).get('page') ?? 1)
        if (pagina === 1) {
          const lote = Array.from({ length: 200 }, (_, i) => devolucionLista({ id: i + 1, total: 2000 }))
          return { cuerpo: paginaDe(lote, { count: 202, next: 'x?page=2' }) }
        }
        if (fallarPagina2) return errorDeApi(500, 'server_error', 'Falló devoluciones p2.')
        return {
          cuerpo: paginaDe([devolucionLista({ id: 201, total: 5000 }), devolucionLista({ id: 202, total: 10000 })], {
            count: 202,
            next: null,
          }),
        }
      },
    })

    const primera = renderHook(() => useDevolucionesDeHoy('2026-11-08'), { wrapper: envoltura() })
    await waitFor(() => expect(primera.result.current.isSuccess).toBe(true))
    expect(primera.result.current.data).toEqual({ total: 415000, cantidad: 202 })

    fallarPagina2 = true
    const segunda = renderHook(() => useDevolucionesDeHoy('2026-11-08'), { wrapper: envoltura() })
    await waitFor(() => expect(segunda.result.current.isError).toBe(true))
    expect(segunda.result.current.data).toBeUndefined()
  })
})
