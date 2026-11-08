import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrir(ruta: string, usuario = dueno) {
  simularApi({
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /settings/business': () => ({
      cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: '2026-11-01T08:00:00-05:00' },
    }),
    'GET /users': () => ({ cuerpo: [dueno, vendedor, { ...vendedor, id: 9, username: 'ex', is_active: false }] }),
  })
  mostrarRutas(usuario, ruta)
}

describe('vistas de configuración', () => {
  it('usuarios cuenta los activos y Ctrl+N abre uno nuevo', async () => {
    abrir('/configuracion/usuarios')

    const indicadores = await screen.findByRole('region', { name: 'Indicadores' })
    await waitFor(() => expect(within(indicadores).getByRole('definition')).toHaveTextContent('2'))
    await userEvent.setup().keyboard('{Control>}n{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Nuevo usuario' })).toBeInTheDocument()
  })

  it('datos del negocio va en una tarjeta con su encabezado', async () => {
    abrir('/configuracion/negocio', vendedor)

    expect(screen.getByRole('heading', { level: 2, name: 'Datos del negocio' })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.tarjeta-de-formulario')).not.toBeNull())
  })

  it('actualizar programa tiene su encabezado y su tarjeta', () => {
    abrir('/configuracion/actualizaciones')

    expect(screen.getByRole('heading', { level: 2, name: 'Actualizar programa' })).toBeInTheDocument()
    expect(document.querySelector('.tarjeta-de-formulario')).not.toBeNull()
  })
})
