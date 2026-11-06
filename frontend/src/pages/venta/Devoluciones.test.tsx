import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaleDetail, User } from '../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { devolucion, paginaDe, venta } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const ventaMixta = (cambios: Partial<SaleDetail> = {}): SaleDetail =>
  venta({
    total: 65000,
    items_count: 1,
    services_count: 1,
    items: [
      {
        id: 77,
        product: { id: 1, code: 'FRE-PUL-PAS', name: 'Pastillas de freno Pulsar 180' },
        description: 'FRE-PUL-PAS · Pastillas de freno Pulsar 180',
        quantity: 2,
        returned_quantity: 0,
        list_price: 25000,
        unit_price: 25000,
        price_changed: false,
        subtotal: 50000,
      },
    ],
    services: [
      {
        id: 9,
        service_type: { id: 1, code: 101, name: 'Cambio de aceite' },
        mechanic: { id: 1, name: 'Carlos Ruiz' },
        details: 'Sintético',
        suggested_price: 15000,
        labor_price: 15000,
        price_changed: false,
        is_returned: false,
      },
    ],
    payments: [{ method: 'cash', method_label: 'Efectivo', amount: 65000 }],
    ...cambios,
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

function abrirDetalle(usuario: User, rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /cash-sessions/current': () => ({ cuerpo: { is_open: true } }),
    'GET /sales/41': () => ({ cuerpo: ventaMixta() }),
    ...rutas,
  })
  mostrarRutas(usuario, '/venta/historial/41')
  return { api, u: userEvent.setup() }
}

describe('registrar devolución desde el detalle de la venta', () => {
  it('el vendedor devuelve un producto eligiendo su estado, pero no ve la causa de mal servicio', async () => {
    const { api, u } = abrirDetalle(vendedor, {
      'POST /sales/41/returns': () => ({
        estado: 201,
        cuerpo: devolucion({
          customer: null,
          total: 25000,
        }),
      }),
    })

    await u.click(await screen.findByRole('button', { name: 'Devolver…' }))
    expect(screen.queryByRole('option', { name: /Mal servicio/ })).not.toBeInTheDocument()

    const cantidad = screen.getByLabelText('Cantidad a devolver de FRE-PUL-PAS · Pastillas de freno Pulsar 180')
    await u.clear(cantidad)
    await u.type(cantidad, '1')

    await u.type(screen.getByLabelText('Motivo de la devolución'), 'No le sirvió la referencia')
    // Sin elegir estado del producto aún no se puede registrar.
    expect(screen.getByRole('button', { name: /Registrar devolución/ })).toBeDisabled()

    await u.selectOptions(
      screen.getByLabelText('Estado de FRE-PUL-PAS · Pastillas de freno Pulsar 180'),
      'Vuelve al inventario',
    )

    await u.click(screen.getByRole('button', { name: /Registrar devolución/ }))

    expect(await screen.findByRole('article', { name: 'Devolución n.º 3' })).toHaveTextContent('Sin cliente')
    const enviado = api.llamadas.find((l) => l.clave === 'POST /sales/41/returns')?.cuerpo as Record<string, unknown>
    expect(enviado).toMatchObject({
      cause: 'other',
      reason: 'No le sirvió la referencia',
      items: [{ sale_item: 77, quantity: 1, condition: 'resellable' }],
      refunds: [{ method: 'cash', amount: 25000 }],
    })
    expect(typeof enviado.idempotency_key).toBe('string')
  })

  it('el dueño registra una devolución por mal servicio con servicio, repuesto dañado y reembolso mixto', async () => {
    const { api, u } = abrirDetalle(dueno, {
      'POST /sales/41/returns': () => ({
        estado: 201,
        cuerpo: devolucion({
          cause: 'bad_service',
          cause_label: 'Mal servicio del mecánico',
          reason: 'Quedó botando aceite',
          total: 40000,
          items: [
            {
              id: 5,
              sale_item: 77,
              product: { id: 1, code: 'FRE-PUL-PAS', name: 'Pastillas de freno Pulsar 180' },
              description: 'FRE-PUL-PAS · Pastillas de freno Pulsar 180',
              quantity: 1,
              condition: 'damaged',
              condition_label: 'No puede volver',
              unit_price: 25000,
              subtotal: 25000,
            },
          ],
          services: [
            {
              id: 2,
              sale_service: 9,
              service_type: { id: 1, code: 101, name: 'Cambio de aceite' },
              mechanic: { id: 1, name: 'Carlos Ruiz' },
              details: 'Sintético',
              labor_price: 15000,
            },
          ],
          refunds: [
            { method: 'cash', method_label: 'Efectivo', amount: 15000 },
            { method: 'transfer', method_label: 'Transferencia', amount: 25000 },
          ],
          mechanic_deduction: {
            mechanic: { id: 1, name: 'Carlos Ruiz' },
            amount: 40000,
            applied_amount: 0,
            pending_amount: 40000,
          },
        }),
      }),
    })

    await u.click(await screen.findByRole('button', { name: 'Devolver…' }))
    await u.selectOptions(screen.getByLabelText('Causa'), 'bad_service')
    await u.type(screen.getByLabelText('Motivo de la devolución'), 'Quedó botando aceite')

    const cantidad = screen.getByLabelText('Cantidad a devolver de FRE-PUL-PAS · Pastillas de freno Pulsar 180')
    await u.clear(cantidad)
    await u.type(cantidad, '1')
    await u.selectOptions(
      screen.getByLabelText('Estado de FRE-PUL-PAS · Pastillas de freno Pulsar 180'),
      'damaged',
    )
    await u.click(screen.getByLabelText('Devolver servicio 101 · Cambio de aceite'))

    await u.click(screen.getByLabelText('Mixto'))
    await u.type(screen.getByLabelText('Reembolso por transferencia'), '25000')
    await u.click(screen.getByRole('button', { name: /Registrar devolución/ }))

    const comprobante = await screen.findByRole('article', { name: 'Devolución n.º 3' })
    expect(comprobante).toHaveTextContent('Mal servicio del mecánico')
    expect(comprobante).toHaveTextContent(/Descuento a Carlos Ruiz: \$\s?40\.000/)
    const enviado = api.llamadas.find((l) => l.clave === 'POST /sales/41/returns')?.cuerpo
    expect(enviado).toMatchObject({
      cause: 'bad_service',
      reason: 'Quedó botando aceite',
      items: [{ sale_item: 77, quantity: 1, condition: 'damaged' }],
      services: [9],
      refunds: [
        { method: 'cash', amount: 15000 },
        { method: 'transfer', amount: 25000 },
      ],
    })
  })

  it('limita a las unidades que faltan por devolver y deshabilita los servicios ya devueltos', async () => {
    const { u } = abrirDetalle(dueno, {
      'GET /sales/41': () => ({
        cuerpo: ventaMixta({
          items: [{ ...ventaMixta().items[0], quantity: 2, returned_quantity: 1 }],
          services: [{ ...ventaMixta().services[0], is_returned: true }],
        }),
      }),
    })

    expect(await screen.findByText('Devueltas: 1 de 2')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Devolver…' }))

    const cantidad = screen.getByLabelText('Cantidad a devolver de FRE-PUL-PAS · Pastillas de freno Pulsar 180')
    expect(cantidad).toHaveAttribute('max', '1')
    expect(screen.getByLabelText('Devolver servicio 101 · Cambio de aceite')).toBeDisabled()
  })

  it('muestra los errores de campos y reutiliza la misma idempotency_key al reintentar', async () => {
    let intentos = 0
    const { api, u } = abrirDetalle(dueno, {
      'POST /sales/41/returns': () =>
        ++intentos === 1
          ? errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
              items: [{ quantity: ['Solo queda 1 por devolver.'] }],
              services: ['Indica los servicios de un solo mecánico.'],
            })
          : { estado: 201, cuerpo: devolucion() },
    })

    await u.click(await screen.findByRole('button', { name: 'Devolver…' }))
    const cantidad = screen.getByLabelText('Cantidad a devolver de FRE-PUL-PAS · Pastillas de freno Pulsar 180')
    await u.clear(cantidad)
    await u.type(cantidad, '1')
    await u.selectOptions(
      screen.getByLabelText('Estado de FRE-PUL-PAS · Pastillas de freno Pulsar 180'),
      'resellable',
    )
    await u.type(screen.getByLabelText('Motivo de la devolución'), 'Cambio')
    await u.click(screen.getByRole('button', { name: /Registrar devolución/ }))

    expect(await screen.findByText('Solo queda 1 por devolver.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Indica los servicios de un solo mecánico.')

    await u.click(screen.getByRole('button', { name: /Registrar devolución/ }))
    await screen.findByRole('article', { name: 'Devolución n.º 3' })

    const envios = api.llamadas
      .filter((l) => l.clave === 'POST /sales/41/returns')
      .map((l) => (l.cuerpo as { idempotency_key: string }).idempotency_key)
    expect(envios).toHaveLength(2)
    expect(envios[0]).toBe(envios[1])
  })

  it('conserva el error en el producto enviado aunque cambie la selección, muestra errores de refunds.* y bloquea decimales', async () => {
    const { u } = abrirDetalle(dueno, {
      'GET /sales/41': () => ({
        cuerpo: ventaMixta({
          items: [
            {
              id: 70,
              product: { id: 2, code: 'BUJ-NGK-CR8', name: 'Bujía CR8E' },
              description: 'BUJ-NGK-CR8 · Bujía CR8E',
              quantity: 1,
              returned_quantity: 0,
              list_price: 15000,
              unit_price: 15000,
              price_changed: false,
              subtotal: 15000,
            },
            ...ventaMixta().items,
          ],
        }),
      }),
      'POST /sales/41/returns': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          items: [{ quantity: ['Error exclusivo de las pastillas.'] }],
          refunds: [{ amount: ['El monto de reembolso no coincide.'] }],
        }),
    })

    await u.click(await screen.findByRole('button', { name: 'Devolver…' }))
    const cantidadPastillas = screen.getByLabelText('Cantidad a devolver de FRE-PUL-PAS · Pastillas de freno Pulsar 180')
    await u.clear(cantidadPastillas)
    await u.type(cantidadPastillas, '1')
    await u.selectOptions(
      screen.getByLabelText('Estado de FRE-PUL-PAS · Pastillas de freno Pulsar 180'),
      'resellable',
    )
    await u.type(screen.getByLabelText('Motivo de la devolución'), 'Cambio')

    await u.click(screen.getByLabelText('Mixto'))
    const campoTransferencia = screen.getByLabelText('Reembolso por transferencia')
    await u.type(campoTransferencia, '100.5')
    expect(screen.getByRole('button', { name: /Registrar devolución/ })).toBeDisabled()

    await u.clear(campoTransferencia)
    await u.type(campoTransferencia, '10000')
    await u.click(screen.getByRole('button', { name: /Registrar devolución/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('El monto de reembolso no coincide.')
    const tabla = screen.getByRole('table', { name: 'Productos para devolver' })
    const filaPastillas = within(tabla).getByRole('row', { name: /FRE-PUL-PAS/ })
    const filaBujia = within(tabla).getByRole('row', { name: /BUJ-NGK-CR8/ })
    expect(filaPastillas).toHaveTextContent('Error exclusivo de las pastillas.')
    expect(filaBujia).not.toHaveTextContent('Error exclusivo de las pastillas.')

    // Al seleccionar ahora el primer producto (Bujía), el error del envío anterior debe seguir en Pastillas.
    const cantidadBujia = screen.getByLabelText('Cantidad a devolver de BUJ-NGK-CR8 · Bujía CR8E')
    await u.clear(cantidadBujia)
    await u.type(cantidadBujia, '1')
    expect(filaPastillas).toHaveTextContent('Error exclusivo de las pastillas.')
    expect(filaBujia).not.toHaveTextContent('Error exclusivo de las pastillas.')
  })
})

describe('pestaña de devoluciones', () => {
  it('lista las devoluciones, muestra «Sin cliente» cuando no hay cliente, filtra y abre el detalle', async () => {
    const sinCliente = devolucion({ id: 4, number: 4, customer: null, cause: 'bad_service', cause_label: 'Mal servicio del mecánico' })
    const api = simularApi({
      'GET /sale-returns*': (_, ruta) => ({
        cuerpo: paginaDe(ruta.includes('/sale-returns/') ? [] : [devolucion(), sinCliente]),
      }),
      'GET /sale-returns/4': () => ({ cuerpo: sinCliente }),
    })
    mostrarRutas(vendedor, '/venta/devoluciones')
    const u = userEvent.setup()

    const filaSinCliente = await screen.findByRole('row', { name: /N\.º 4/ })
    expect(filaSinCliente).toHaveTextContent('Sin cliente')
    expect(filaSinCliente).toHaveTextContent('Mal servicio del mecánico')

    await u.selectOptions(screen.getByLabelText('Causa'), 'Mal servicio del mecánico')
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-05' } })
    await waitFor(() =>
      expect(api.llamadas.some((l) => l.clave === 'GET /sale-returns?cause=bad_service&date_from=2026-11-05')).toBe(true),
    )

    await u.click(within(filaSinCliente).getByRole('link', { name: 'N.º 4' }))
    expect(await screen.findByRole('article', { name: 'Devolución n.º 4' })).toHaveTextContent('Sin cliente')
  })
})
