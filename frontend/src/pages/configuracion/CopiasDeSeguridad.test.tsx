import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureApi } from '../../api/client'
import { BASE, dueno, simularApi, vendedor } from '../../test/apiSimulada'
import { mostrarRutas } from '../../test/mostrar'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CopiasDeSeguridad', () => {
  it('restringe el acceso al vendedor', async () => {
    simularApi({})
    mostrarRutas(vendedor, '/configuracion/respaldos')

    expect(await screen.findByText('Esta sección es solo para el dueño.')).toBeInTheDocument()
  })

  it('muestra aviso si no hay copia externa y permite descargar respaldo verificando actualización de estado', async () => {
    let ultimaCopia: string | null = null
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const ruta = String(url).replace(BASE, '')
      if (ruta === '/settings/business') {
        return new Response(
          JSON.stringify({
            name: 'Punto Moto',
            tax_id: '900123456',
            address: 'Calle 1',
            phone: '3001234567',
            receipt_footer: '',
            default_mechanic_percentage: 60,
            updated_at: '2026-11-13T08:00:00-05:00',
            last_backup_at: ultimaCopia,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (ruta === '/backups/download') {
        ultimaCopia = '2026-11-13T12:00:00-05:00'
        return new Response(new Blob(['SQLite format 3\0']), {
          status: 200,
          headers: {
            'Content-Type': 'application/x-sqlite3',
            'Content-Disposition': 'attachment; filename="punto-moto-respaldo-2026-11-13.sqlite3"',
            'X-Backup-Sha256': 'abc123',
          },
        })
      }
      if (ruta === '/cash-sessions/current') {
        return new Response(JSON.stringify({ is_open: false, session: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (ruta.startsWith('/products')) {
        return new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    configureApi({ baseUrl: BASE })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:respaldo')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    mostrarRutas(dueno, '/configuracion/respaldos')
    const u = userEvent.setup()

    expect(
      await screen.findByText('Todavía no se ha descargado ninguna copia externa'),
    ).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Descargar copia de seguridad' }))

    await waitFor(() =>
      expect(
        screen.getByText(
          'Copia descargada: punto-moto-respaldo-2026-11-13.sqlite3. Guárdala en una USB, otro disco o en la nube.',
        ),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByText('Todavía no se ha descargado ninguna copia externa'),
    ).not.toBeInTheDocument()
  })
})
