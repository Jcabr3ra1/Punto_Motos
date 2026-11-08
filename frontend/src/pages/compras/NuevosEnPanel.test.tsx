import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi } from '../../test/apiSimulada'
import { paginaDe, proveedor } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(ruta: string) {
  simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /suppliers*': () => ({ cuerpo: [proveedor()] }),
    'GET /purchases*': () => ({ cuerpo: paginaDe([]) }),
    'GET /consignees*': () => ({ cuerpo: [] }),
    'GET /consignment-deliveries*': () => ({ cuerpo: paginaDe([]) }),
    'GET /consignment-reports*': () => ({ cuerpo: paginaDe([]) }),
  })
  mostrarRutas(dueno, ruta)
}

describe('formularios nuevos en panel lateral', () => {
  it('Nueva compra se abre en un panel con la lista de compras detrás', async () => {
    abrir('/compras/lista')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('link', { name: 'Nueva compra' }))

    const panel = await screen.findByRole('dialog', { name: 'Nueva compra' })
    expect(within(panel).getByLabelText('Proveedor')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Compras' })).toBeInTheDocument()
  })

  it('Cancelar cierra el panel de la compra y deja la lista', async () => {
    abrir('/compras/lista/nueva')
    const u = userEvent.setup()

    await u.click(await within(await screen.findByRole('dialog', { name: 'Nueva compra' })).findByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog', { name: 'Nueva compra' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Compras' })).toBeInTheDocument()
  })

  it.each([
    ['/consignacion/entregas', 'Nueva entrega', 'Entregas'],
    ['/consignacion/reportes', 'Nuevo reporte', 'Reportes'],
  ])('%s abre «%s» en un panel con la lista detrás', async (ruta, accion, lista) => {
    abrir(ruta)
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: accion }))

    expect(await screen.findByRole('dialog', { name: accion })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: lista })).toBeInTheDocument()
  })
})
