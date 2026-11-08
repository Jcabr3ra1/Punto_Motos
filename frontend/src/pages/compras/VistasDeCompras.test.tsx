import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi } from '../../test/apiSimulada'
import { paginaDe, proveedor } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(ruta: string) {
  const api = simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /suppliers*': () => ({
      cuerpo: [proveedor({ balance_due: 3000000 }), proveedor({ id: 2, name: 'Otro', balance_due: 920000 }), proveedor({ id: 3, name: 'Al día', balance_due: 0 })],
    }),
    'GET /purchases*': (_, r) => {
      const consulta = new URLSearchParams(String(r).split('?')[1])
      if (consulta.get('page_size') === '1') return { cuerpo: paginaDe([], { count: consulta.get('status') === 'draft' ? 3 : 14 }) }
      return { cuerpo: paginaDe([]) }
    },
    'GET /supplier-payments*': (_, r) =>
      String(r).includes('page_size=1') ? { cuerpo: paginaDe([], { count: 5 }) } : { cuerpo: paginaDe([]) },
  })
  mostrarRutas(dueno, ruta)
  return api
}

async function cifras() {
  const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
  return () => within(indicadores).getAllByRole('definition').map((d) => d.textContent?.replace(/\s/g, ' '))
}

describe('vistas de compras', () => {
  it('compras cuenta los borradores y las recibidas por pagar', async () => {
    const api = abrir('/compras/lista')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['3', '14']))
    const porPagar = api.llamadas.find((l) => l.clave.includes('status=received') && l.clave.includes('page_size=1'))
    expect(porPagar?.clave).toContain('payment_status=pending%2Cpartial')
    expect(porPagar?.clave).not.toContain('date_from')
  })

  it('proveedores suma lo que se debe y cuenta a quién', async () => {
    abrir('/compras/proveedores')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['$ 3.920.000', '2']))
  })

  it('abonos cuenta los del mes y muestra lo que se debe', async () => {
    abrir('/compras/abonos')

    const leer = await cifras()
    await waitFor(() => expect(leer()).toEqual(['5', '$ 3.920.000']))
  })
})
