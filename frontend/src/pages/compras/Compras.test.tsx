import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PurchaseDetail } from '../../api/types'
import { dueno, errorDeApi, simularApi, type Respuesta } from '../../test/apiSimulada'
import { borrador, compra, paginaDe, producto, proveedor } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const pastillas = producto({ id: 1, cost_price: 18000, stock: 5 })
const bujia = producto({ id: 2, code: 'ELE-UNI-BUJ', name: 'Bujía NGK C7HSA', cost_price: 6000, stock: 0 })
const recibida: PurchaseDetail = {
  ...compra(),
  notes: '',
  items: [
    { id: 1, product: { id: 1, code: 'FRE-PUL-PAS', name: 'Pastillas de freno Pulsar 180' }, quantity: 5, unit_cost: 20000, subtotal: 100000 },
    { id: 2, product: { id: 2, code: 'ELE-UNI-BUJ', name: 'Bujía NGK C7HSA' }, quantity: 10, unit_cost: 5500, subtotal: 55000 },
  ],
  allocations: [{ payment: 3, paid_on: '2026-11-01', method: 'cash', method_label: 'Efectivo', amount: 50000 }],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function simular(rutas: Parameters<typeof simularApi>[0] = {}) {
  return simularApi({
    'GET /suppliers*': () => ({ cuerpo: [proveedor({ balance_due: 105000 }), proveedor({ id: 2, name: 'Repuestos El Motor' })] }),
    'GET /purchases*': () => ({ cuerpo: paginaDe([compra(), compra({ id: 20, document_number: '', status: 'draft', status_label: 'Borrador', payment_status: null, balance_due: 0 })]) }),
    'GET /catalog/search*': () => ({ cuerpo: [pastillas, bujia] }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
}

const llamadas = (api: { llamadas: { clave: string }[] }, prefijo: string) =>
  api.llamadas.filter((l) => l.clave.startsWith(prefijo)).map((l) => l.clave)

async function agregarProducto(u: ReturnType<typeof userEvent.setup>, texto: string, codigo: RegExp) {
  await u.type(screen.getByRole('combobox', { name: 'Agregar producto' }), texto)
  // Solo se elige cuando los resultados ya corresponden a lo escrito (los anteriores no se pueden elegir).
  await waitFor(() => expect(screen.getAllByRole('option').some((o) => o.getAttribute('aria-selected') === 'true')).toBe(true))
  await u.click(screen.getByRole('option', { name: codigo }))
}

describe('lista de compras', () => {
  it('muestra borradores y recibidas con su total, saldo y estado de pago', async () => {
    simular()
    mostrarRutas(dueno, '/compras')

    const recibidaFila = (await screen.findByRole('link', { name: 'FV-1020' })).closest('tr')!
    expect(recibidaFila).toHaveTextContent(/\$\s?155\.000/)
    expect(recibidaFila).toHaveTextContent(/\$\s?105\.000/)
    expect(recibidaFila).toHaveTextContent('Con abonos')
    const borradorFila = screen.getByRole('link', { name: 'Compra n.º 20' }).closest('tr')!
    expect(borradorFila).toHaveTextContent('Borrador')
    expect(screen.getByRole('link', { name: 'FV-1020' })).toHaveAttribute('href', '/compras/lista/15')
  })

  it('filtra por proveedor, estado, pago y fechas', async () => {
    const api = simular()
    mostrarRutas(dueno, '/compras/lista')
    const u = userEvent.setup()
    await screen.findByRole('table')

    await u.selectOptions(screen.getByLabelText('Proveedor'), 'Distribuidora Andina')
    await u.selectOptions(screen.getByLabelText('Estado'), 'Recibidas')
    await u.selectOptions(screen.getByLabelText('Pago'), 'Con saldo')

    await waitFor(() =>
      expect(llamadas(api, 'GET /purchases')).toContain('GET /purchases?supplier=1&status=received&payment_status=pending%2Cpartial'),
    )
  })

  it('el dueño ve Compras en el menú con sus tres pestañas', async () => {
    simular()
    mostrarRutas(dueno, '/compras/lista')

    const pestanas = within(screen.getByRole('navigation', { name: 'Compras' })).getAllByRole('link')
    expect(pestanas.map((p) => p.textContent)).toEqual(['Compras', 'Proveedores', 'Abonos'])
  })
})

describe('nueva compra', () => {
  it('agrega productos con el costo actual precargado y crea el borrador', async () => {
    const api = simular({
      'POST /purchases': () => ({ estado: 201, cuerpo: borrador({ id: 30 }) }),
      'GET /purchases/30': () => ({ cuerpo: borrador({ id: 30 }) }),
    })
    mostrarRutas(dueno, '/compras/lista/nueva')
    const u = userEvent.setup()

    await u.selectOptions(await screen.findByLabelText('Proveedor'), 'Distribuidora Andina')
    await u.type(screen.getByLabelText('Factura o remisión'), 'FV-2001')
    await agregarProducto(u, 'pas', /FRE-PUL-PAS/)
    // Se pueden comprar productos agotados.
    await agregarProducto(u, 'buj', /ELE-UNI-BUJ/)

    expect(screen.getByLabelText('Costo por unidad de Pastillas de freno Pulsar 180')).toHaveValue(18000)
    expect(screen.getByLabelText('Costo por unidad de Bujía NGK C7HSA')).toHaveValue(6000)
    await u.clear(screen.getByLabelText('Cantidad de Pastillas de freno Pulsar 180'))
    await u.type(screen.getByLabelText('Cantidad de Pastillas de freno Pulsar 180'), '3')
    expect(screen.getByRole('row', { name: /Total \(orientativo\)/ })).toHaveTextContent(/\$\s?60\.000/)

    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText(/Borrador creado/)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /purchases')?.cuerpo).toEqual({
      supplier: 1,
      document_number: 'FV-2001',
      notes: '',
      items: [
        { product: 1, quantity: 3, unit_cost: 18000 },
        { product: 2, quantity: 1, unit_cost: 6000 },
      ],
    })
  })

  it('elegir un producto que ya está suma una unidad en vez de repetir la línea', async () => {
    simular()
    mostrarRutas(dueno, '/compras/lista/nueva')
    const u = userEvent.setup()
    await screen.findByLabelText('Proveedor')

    await agregarProducto(u, 'pas', /FRE-PUL-PAS/)
    await agregarProducto(u, 'pas', /FRE-PUL-PAS/)

    expect(screen.getAllByLabelText(/^Cantidad de/)).toHaveLength(1)
    expect(screen.getByLabelText('Cantidad de Pastillas de freno Pulsar 180')).toHaveValue(2)
    expect(screen.getByText(/ya estaba en la compra: se sumó una unidad/)).toBeInTheDocument()
  })

  it('muestra los errores de cada línea y del documento', async () => {
    simular({
      'POST /purchases': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          document_number: ['Ya hay una compra de este proveedor con ese documento.'],
          items: [{ quantity: ['Asegúrese de que este valor es mayor o igual a 1.'] }],
        }),
    })
    mostrarRutas(dueno, '/compras/lista/nueva')
    const u = userEvent.setup()

    await u.selectOptions(await screen.findByLabelText('Proveedor'), 'Distribuidora Andina')
    await u.type(screen.getByLabelText('Factura o remisión'), 'FV-1020')
    await agregarProducto(u, 'pas', /FRE-PUL-PAS/)
    await u.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText('Ya hay una compra de este proveedor con ese documento.')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Pastillas de freno Pulsar 180/ })).getByText(/mayor o igual a 1/)).toBeInTheDocument()
  })
})

describe('borrador guardado', () => {
  function abrirBorrador(rutas: Parameters<typeof simularApi>[0] = {}, datos = borrador()) {
    const api = simular({ 'GET /purchases/20': () => ({ cuerpo: datos }), ...rutas })
    mostrarRutas(dueno, '/compras/lista/20')
    return { api, u: userEvent.setup() }
  }

  it('no deja recibir con cambios sin guardar y guarda reemplazando las líneas', async () => {
    const { api, u } = abrirBorrador({
      'PATCH /purchases/20': () => ({ cuerpo: borrador({ items: [{ ...borrador().items[0], quantity: 4, subtotal: 80000 }], total: 80000 }) }),
    })
    const cantidad = await screen.findByLabelText('Cantidad de Pastillas de freno Pulsar 180')
    expect(screen.getByRole('button', { name: 'Recibir compra…' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()

    await u.clear(cantidad)
    await u.type(cantidad, '4')

    expect(screen.getByRole('button', { name: 'Recibir compra…' })).toBeDisabled()
    expect(screen.getByText('Guarda los cambios antes de recibir: se recibe lo que está guardado.')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Borrador guardado\. Total: \$\s?80\.000\./)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'PATCH /purchases/20')?.cuerpo).toMatchObject({
      items: [{ product: 1, quantity: 4, unit_cost: 20000 }],
    })
  })

  it('un borrador sin productos no se puede recibir', async () => {
    abrirBorrador({}, borrador({ items: [], total: 0, items_count: 0 }))

    expect(await screen.findByRole('button', { name: 'Recibir compra…' })).toBeDisabled()
    expect(screen.getByText('Agrega productos y guarda el borrador antes de recibir.')).toBeInTheDocument()
  })

  it('si no se puede borrar, el motivo se ve dentro de la confirmación', async () => {
    const { u } = abrirBorrador({
      'DELETE /purchases/20': () => errorDeApi(409, 'purchase_not_draft', 'La compra ya fue recibida: no se puede borrar.'),
    })

    await u.click(await screen.findByRole('button', { name: 'Borrar borrador' }))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Borrar este borrador?' })
    await u.click(within(confirmacion).getByRole('button', { name: 'Sí, borrar' }))

    expect(await within(confirmacion).findByRole('alert')).toHaveTextContent('La compra ya fue recibida: no se puede borrar.')
  })

  it('se borra con confirmación y vuelve a la lista', async () => {
    const { api, u } = abrirBorrador({ 'DELETE /purchases/20': () => ({ estado: 204 }) })

    await u.click(await screen.findByRole('button', { name: 'Borrar borrador' }))
    expect(api.cuantas('DELETE /purchases/20')).toBe(0)
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Borrar este borrador?' })
    expect(within(confirmacion).getByRole('button', { name: 'Volver' })).toHaveFocus()
    await u.click(within(confirmacion).getByRole('button', { name: 'Sí, borrar' }))

    expect(await screen.findByText('Borrador borrado.')).toBeInTheDocument()
    expect(api.cuantas('DELETE /purchases/20')).toBe(1)
  })

  it('recibe la compra con abono y muestra qué precios subieron', async () => {
    let datos: PurchaseDetail = borrador()
    const { api, u } = abrirBorrador({
      'GET /purchases/20': () => ({ cuerpo: datos }),
      'POST /purchases/20/receive': () => {
        datos = { ...borrador(), status: 'received', status_label: 'Recibida', paid_amount: 20000, balance_due: 40000, payment_status: 'partial', received_at: '2026-11-02T09:00:00-05:00', received_by: 'dueno' }
        return {
          cuerpo: {
            ...datos,
            price_changes: [
              { product: { id: 1, code: 'FRE-PUL-PAS', name: 'Pastillas de freno Pulsar 180' }, old_price: 25000, new_price: 26000 },
            ],
          },
        }
      },
    })

    await u.click(await screen.findByRole('button', { name: 'Recibir compra…' }))
    const confirmacion = screen.getByRole('group', { name: '¿Recibir la compra?' })
    expect(confirmacion).toHaveTextContent(/1 producto al inventario, por un total de \$\s?60\.000/)
    expect(within(confirmacion).getByRole('button', { name: 'Volver' })).toHaveFocus()
    await u.click(screen.getByLabelText('Entregar un abono con la mercancía'))
    await u.type(screen.getByLabelText('Valor del abono'), '20000')
    await u.click(screen.getByRole('button', { name: 'Sí, recibir la compra' }))

    expect(await screen.findByText(/Compra recibida/)).toBeInTheDocument()
    expect(screen.getByText(/Pastillas de freno Pulsar 180: \$\s?25\.000 → \$\s?26\.000/)).toBeInTheDocument()
    const cuerpo = api.llamadas.find((l) => l.clave === 'POST /purchases/20/receive')?.cuerpo as { payment: object }
    expect(cuerpo.payment).toMatchObject({ amount: 20000, method: 'cash' })
    expect(await screen.findByLabelText('Resumen de la compra')).toHaveTextContent(/Saldo\$\s?40\.000/)
  })

  it('sin abono envía el cuerpo vacío', async () => {
    const { api, u } = abrirBorrador({ 'POST /purchases/20/receive': () => ({ cuerpo: { ...recibida, price_changes: [] } }) })

    await u.click(await screen.findByRole('button', { name: 'Recibir compra…' }))
    await u.click(screen.getByRole('button', { name: 'Sí, recibir la compra' }))

    await screen.findByText(/Compra recibida/)
    expect(api.llamadas.find((l) => l.clave === 'POST /purchases/20/receive')?.cuerpo).toEqual({})
  })

  it('el error anidado del abono sale junto a su campo y la compra sigue en borrador', async () => {
    const { u } = abrirBorrador({
      'POST /purchases/20/receive': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          payment: { amount: ['Se deben $60.000: no se pueden abonar $90.000.'] },
        }),
    })

    await u.click(await screen.findByRole('button', { name: 'Recibir compra…' }))
    await u.click(screen.getByLabelText('Entregar un abono con la mercancía'))
    await u.type(screen.getByLabelText('Valor del abono'), '90000')
    await u.click(screen.getByRole('button', { name: 'Sí, recibir la compra' }))

    expect(await screen.findByText('Se deben $60.000: no se pueden abonar $90.000.')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor del abono')).toHaveAccessibleDescription(/no se pueden abonar/)
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  it('envía una sola vez aunque se pulse varias veces', async () => {
    let terminar: (r: Respuesta) => void = () => {}
    const { api, u } = abrirBorrador({
      'POST /purchases/20/receive': () => new Promise<Respuesta>((r) => (terminar = r)),
    })

    await u.click(await screen.findByRole('button', { name: 'Recibir compra…' }))
    const boton = screen.getByRole('button', { name: 'Sí, recibir la compra' })
    await u.dblClick(boton)
    await u.click(boton)

    expect(api.cuantas('POST /purchases/20/receive')).toBe(1)
    expect(screen.getByRole('button', { name: 'Recibiendo…' })).toBeDisabled()
    await act(async () => terminar({ cuerpo: { ...recibida, price_changes: [] } }))
  })

  it('si ya estaba recibida (409), lo explica y muestra la compra recibida', async () => {
    let datos: PurchaseDetail = borrador()
    const { u } = abrirBorrador({
      'GET /purchases/20': () => ({ cuerpo: datos }),
      'POST /purchases/20/receive': () => {
        datos = { ...recibida, id: 20 }
        return errorDeApi(409, 'purchase_received', 'La compra ya se recibió: no se puede modificar.')
      },
    })

    await u.click(await screen.findByRole('button', { name: 'Recibir compra…' }))
    await u.click(screen.getByRole('button', { name: 'Sí, recibir la compra' }))

    expect(await screen.findByText('La compra ya se recibió: no se puede modificar.')).toBeInTheDocument()
    expect(await screen.findByLabelText('Resumen de la compra')).toBeInTheDocument()
  })
})

describe('compra recibida', () => {
  it('se consulta sin poder editarla y permite abonar a esa compra', async () => {
    const api = simular({
      'GET /purchases/15': () => ({ cuerpo: recibida }),
      'POST /supplier-payments': () => ({
        estado: 201,
        cuerpo: {
          id: 10,
          supplier: { id: 1, name: 'Distribuidora Andina' },
          amount: 30000,
          method: 'cash',
          method_label: 'Efectivo',
          paid_on: '2026-11-02',
          notes: '',
          allocations: [{ purchase: 15, document_number: 'FV-1020', amount: 30000 }],
          created_by: 'dueno',
          created_at: '2026-11-02T09:00:00-05:00',
        },
      }),
    })
    mostrarRutas(dueno, '/compras/lista/15')
    const u = userEvent.setup()

    expect(await screen.findByLabelText('Resumen de la compra')).toHaveTextContent(/Saldo\$\s?105\.000/)
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Borrar borrador' })).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Bujía NGK C7HSA/ })).toHaveTextContent(/\$\s?55\.000/)

    await u.click(screen.getByRole('button', { name: 'Abonar a esta compra' }))
    await u.type(await screen.findByLabelText('Valor'), '30000')
    await u.click(screen.getByRole('button', { name: 'Registrar abono' }))

    expect(await screen.findByText(/Abono de \$\s?30\.000 registrado/)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /supplier-payments')?.cuerpo).toMatchObject({
      supplier: 1,
      purchase: 15,
      amount: 30000,
    })
  })
})
