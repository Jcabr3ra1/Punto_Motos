import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../test/apiSimulada'
import { mostrarRutas } from '../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Notificaciones en barra superior', () => {
  it('muestra productos agotados y por acabarse al vendedor y se cierra con Escape', async () => {
    simularApi({
      'GET /notifications': () => ({
        cuerpo: {
          low_stock_count: 2,
          low_stock: [
            { id: 1, code: 'FRE-PUL-001', name: 'Pastillas freno Pulsar', stock: 0, min_stock: 4 },
            { id: 2, code: 'ACE-MOT-001', name: 'Aceite 20W50', stock: 2, min_stock: 5 },
          ],
          alerts: [],
        },
      }),
    })
    mostrarRutas(vendedor, '/')
    const u = userEvent.setup()

    const boton = await screen.findByRole('button', { name: 'Notificaciones (2 alertas)' })
    await u.click(boton)

    const panel = screen.getByRole('region', { name: 'Notificaciones del negocio' })
    expect(within(panel).getByText('Pastillas freno Pulsar')).toBeInTheDocument()
    expect(within(panel).getByText('Agotado')).toBeInTheDocument()
    expect(within(panel).getByText('Aceite 20W50')).toBeInTheDocument()
    expect(within(panel).getByText('2 / mín. 5')).toBeInTheDocument()
    expect(within(panel).queryByText('Atención del negocio')).not.toBeInTheDocument()

    await u.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Notificaciones del negocio' })).not.toBeInTheDocument()
  })

  it('muestra al dueño avisos operativos y navega al pulsar una alerta', async () => {
    simularApi({
      'GET /notifications': () => ({
        cuerpo: {
          low_stock_count: 0,
          low_stock: [],
          alerts: [
            {
              key: 'cash_previous_day',
              title: 'Caja de día anterior abierta',
              detail: 'Ciérrala antes de continuar vendiendo hoy.',
              route: '/caja',
              level: 'urgent',
            },
            {
              key: 'missing_backup',
              title: 'Sin copia de seguridad externa',
              detail: 'Descarga una copia de tus datos para guardarla fuera del equipo.',
              route: '/configuracion/respaldos',
              level: 'warning',
            },
            {
              key: 'pending_settlements',
              title: '1 mecánico por liquidar hoy',
              detail: 'Revisa los servicios realizados en Liquidación del día.',
              route: '/taller/liquidacion',
              level: 'warning',
            },
            {
              key: 'draft_purchases',
              title: '3 compras en borrador',
              detail: 'Aún no entran al inventario.',
              route: '/compras?status=draft&periodo=todas',
              level: 'warning',
            },
          ],
        },
      }),
      'GET /settings/business': () => ({
        cuerpo: {
          name: 'Punto Moto',
          tax_id: '900123456',
          address: 'Calle 1',
          phone: '3001234567',
          receipt_footer: '',
          default_mechanic_percentage: 60,
          updated_at: '2026-11-13T08:00:00-05:00',
          last_backup_at: null,
        },
      }),
    })
    mostrarRutas(dueno, '/')
    const u = userEvent.setup()

    const boton = await screen.findByRole('button', { name: 'Notificaciones (4 alertas)' })
    await u.click(boton)

    const panel = screen.getByRole('region', { name: 'Notificaciones del negocio' })
    expect(within(panel).getByText('Caja de día anterior abierta')).toBeInTheDocument()
    expect(within(panel).getByText('Sin copia de seguridad externa')).toBeInTheDocument()
    expect(within(panel).getByText('1 mecánico por liquidar hoy')).toBeInTheDocument()
    expect(within(panel).getByText('3 compras en borrador')).toBeInTheDocument()

    await u.click(within(panel).getByRole('link', { name: /Sin copia de seguridad externa/i }))
    expect(await screen.findByRole('heading', { name: 'Copias de seguridad' })).toBeInTheDocument()
  })

  it('muestra mensaje Al día cuando no hay alertas pendientes', async () => {
    simularApi({
      'GET /notifications': () => ({
        cuerpo: { low_stock_count: 0, low_stock: [], alerts: [] },
      }),
    })
    mostrarRutas(vendedor, '/')
    const u = userEvent.setup()

    const boton = await screen.findByRole('button', { name: 'Notificaciones' })
    await u.click(boton)

    const panel = screen.getByRole('region', { name: 'Notificaciones del negocio' })
    expect(within(panel).getByText('Al día')).toBeInTheDocument()
    expect(within(panel).getByText('No hay productos por acabarse ni avisos pendientes.')).toBeInTheDocument()
  })

  it('ubica el botón de notificaciones en el grupo de acciones junto a Cerrar sesión', async () => {
    simularApi({
      'GET /notifications': () => ({
        cuerpo: { low_stock_count: 0, low_stock: [], alerts: [] },
      }),
    })
    mostrarRutas(vendedor, '/')

    const notificaciones = await screen.findByRole('button', { name: 'Notificaciones' })
    const acciones = notificaciones.closest('.navbar__acciones')
    expect(acciones).not.toBeNull()
    expect(within(acciones as HTMLElement).getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })
})
