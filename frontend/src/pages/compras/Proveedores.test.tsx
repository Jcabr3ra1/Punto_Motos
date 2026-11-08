import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi, vendedor } from '../../test/apiSimulada'
import { abono, compra, paginaDe, proveedor } from '../../test/datos'
import { mostrarRutas } from '../../test/mostrar'

const andina = proveedor({ balance_due: 105000 })
const motor = proveedor({ id: 2, name: 'Repuestos El Motor', tax_id: '', phone: '', balance_due: 0 })
const viejo = proveedor({ id: 3, name: 'Motopartes Viejo', is_active: false })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    'GET /suppliers*': (_, ruta) => ({ cuerpo: ruta.includes('include_inactive') ? [andina, viejo, motor] : [andina, motor] }),
    'GET /suppliers/1': () => ({ cuerpo: andina }),
    'GET /purchases*': () => ({ cuerpo: paginaDe([compra()]) }),
    'GET /supplier-payments*': () => ({ cuerpo: paginaDe([abono()]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false, finished_at: null, finished_by: null, products_counted: 0, units_counted: 0 } }),
    ...rutas,
  })
  mostrarRutas(dueno, '/compras/proveedores')
  await screen.findByRole('table')
  return { api, u: userEvent.setup() }
}

const llamadas = (api: { llamadas: { clave: string }[] }, prefijo: string) =>
  api.llamadas.filter((l) => l.clave.startsWith(prefijo)).map((l) => l.clave)

describe('lista de proveedores', () => {
  it('muestra lo que se le debe a cada uno y solo ofrece abonar a quien se le debe', async () => {
    await abrir()

    const filaAndina = screen.getByRole('row', { name: /Distribuidora Andina/ })
    expect(filaAndina).toHaveTextContent(/\$\s?105\.000/)
    expect(within(filaAndina).getByRole('button', { name: 'Abonar a Distribuidora Andina' })).toBeInTheDocument()

    const filaMotor = screen.getByRole('row', { name: /Repuestos El Motor/ })
    expect(filaMotor).toHaveTextContent('—')
    expect(within(filaMotor).queryByRole('button', { name: /Abonar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument()
  })

  it('filtra por texto, por deuda y muestra los desactivados', async () => {
    const { api, u } = await abrir()

    await u.type(screen.getByLabelText('Buscar'), 'andina')
    await u.click(screen.getByRole('button', { name: 'Con saldo' }))
    await u.click(screen.getByRole('button', { name: 'Desactivados' }))

    await waitFor(() =>
      expect(llamadas(api, 'GET /suppliers?')).toContain('GET /suppliers?q=andina&with_debt=true&include_inactive=true'),
    )
    expect(await screen.findByText('Motopartes Viejo')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Motopartes Viejo/ })).toHaveTextContent('Desactivado')
  })
})

describe('registro del proveedor', () => {
  it('muestra lo que se le debe, sus datos y sus compras con saldo, con Abonar y Estado de cuenta', async () => {
    const { u } = await abrir()
    expect(screen.getByText('Elige un proveedor para ver su cuenta.')).toBeInTheDocument()

    await u.click(within(screen.getByRole('table', { name: 'Proveedores' })).getByText('Distribuidora Andina'))

    const registro = await screen.findByRole('complementary', { name: 'Distribuidora Andina' })
    expect(registro).toHaveTextContent(/\$\s?105\.000/)
    await waitFor(() => expect(registro).toHaveTextContent('FV-1020'))
    expect(within(registro).getByRole('button', { name: 'Abonar' })).toBeInTheDocument()
    await u.click(within(registro).getByRole('button', { name: 'Estado de cuenta' }))
    expect(await screen.findByRole('dialog', { name: 'Estado de cuenta de «Distribuidora Andina»' })).toBeInTheDocument()
  })
})

describe('panel lateral', () => {
  it('Nuevo proveedor y Abonar se abren en un panel con la lista detrás', async () => {
    const { u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    expect(screen.getByRole('dialog', { name: 'Nuevo proveedor' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    await u.keyboard('{Escape}')

    await u.click(screen.getByRole('button', { name: /Abonar a Distribuidora Andina/ }))
    expect(screen.getByRole('dialog', { name: 'Abonar a «Distribuidora Andina»' })).toBeInTheDocument()
  })
})

describe('crear y editar', () => {
  it('crea un proveedor y vuelve a la lista', async () => {
    const { api, u } = await abrir({
      'POST /suppliers': () => ({ estado: 201, cuerpo: proveedor({ id: 4, name: 'Motos y Más' }) }),
    })

    await u.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    await u.type(screen.getByLabelText('Nombre'), 'Motos y Más')
    await u.type(screen.getByLabelText('Teléfono'), '3001112233')
    await u.click(screen.getByRole('button', { name: 'Crear proveedor' }))

    expect(await screen.findByText('Proveedor «Motos y Más» creado.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /suppliers')?.cuerpo).toEqual({
      name: 'Motos y Más',
      tax_id: '',
      phone: '3001112233',
      notes: '',
    })
  })

  it('muestra el error de nombre repetido junto al campo', async () => {
    const { u } = await abrir({
      'POST /suppliers': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { name: ['Ya existe un proveedor con ese nombre.'] }),
    })

    await u.click(screen.getByRole('button', { name: 'Nuevo proveedor' }))
    await u.type(screen.getByLabelText('Nombre'), 'distribuidora andina')
    await u.click(screen.getByRole('button', { name: 'Crear proveedor' }))

    expect(await screen.findByText('Ya existe un proveedor con ese nombre.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAccessibleDescription(/Ya existe/)
  })

  it('desactiva un proveedor (no se borra)', async () => {
    const { api, u } = await abrir({ 'PATCH /suppliers/2': () => ({ cuerpo: { ...motor, is_active: false } }) })

    await u.click(screen.getByRole('button', { name: 'Editar Repuestos El Motor' }))
    await u.click(screen.getByLabelText('Proveedor activo'))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Cambios de «Repuestos El Motor» guardados.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'PATCH /suppliers/2')?.cuerpo).toMatchObject({ is_active: false })
  })
})

describe('estado de cuenta', () => {
  it('muestra lo que se debe, las compras con saldo y los abonos', async () => {
    const { api, u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Estado de cuenta de Distribuidora Andina' }))

    // El estado de cuenta se abre en una ventana emergente sobre la lista.
    const ventana = await screen.findByRole('dialog', { name: 'Estado de cuenta de «Distribuidora Andina»' })
    expect(await within(ventana).findByLabelText('Saldo del proveedor')).toHaveTextContent(/\$\s?105\.000/)
    const compras = (await within(ventana).findAllByRole('table'))[0]
    expect(within(compras).getByRole('link', { name: 'FV-1020' })).toHaveAttribute('href', '/compras/lista/15')
    expect(await within(ventana).findByText('Nequi')).toBeInTheDocument()
    expect(llamadas(api, 'GET /purchases')).toContain('GET /purchases?supplier=1&payment_status=pending%2Cpartial')
    expect(llamadas(api, 'GET /supplier-payments')).toContain('GET /supplier-payments?supplier=1')
  })
})

describe('abonar desde el proveedor', () => {
  it('registra el abono a las compras más antiguas y cuenta cómo se repartió', async () => {
    const { api, u } = await abrir({
      'POST /supplier-payments': () => ({
        estado: 201,
        cuerpo: abono({
          amount: 45000,
          allocations: [
            { purchase: 12, document_number: 'FV-1001', amount: 30000 },
            { purchase: 15, document_number: 'FV-1020', amount: 15000 },
          ],
        }),
      }),
    })

    await u.click(screen.getByRole('button', { name: 'Abonar a Distribuidora Andina' }))
    await u.type(await screen.findByLabelText('Valor'), '45000')
    await u.click(screen.getByLabelText('Transferencia'))
    await u.type(screen.getByLabelText('Notas'), 'Nequi')
    await u.click(screen.getByRole('button', { name: 'Registrar abono' }))

    expect(
      await screen.findByText(/Abono de \$\s?45\.000 registrado a «Distribuidora Andina»\. Se aplicó a: FV-1001 \(\$\s?30\.000\), FV-1020/),
    ).toBeInTheDocument()
    const cuerpo = api.llamadas.find((l) => l.clave === 'POST /supplier-payments')?.cuerpo
    expect(cuerpo).toMatchObject({ supplier: 1, purchase: null, amount: 45000, method: 'transfer', notes: 'Nequi' })
    expect(cuerpo).toHaveProperty('paid_on')
  })

  it('muestra el error del valor junto al campo', async () => {
    const { u } = await abrir({
      'POST /supplier-payments': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          amount: ['Se deben $105.000: no se pueden abonar $200.000.'],
        }),
    })

    await u.click(screen.getByRole('button', { name: 'Abonar a Distribuidora Andina' }))
    await u.type(await screen.findByLabelText('Valor'), '200000')
    await u.click(screen.getByRole('button', { name: 'Registrar abono' }))

    expect(await screen.findByText('Se deben $105.000: no se pueden abonar $200.000.')).toBeInTheDocument()
    expect(screen.getByLabelText('Valor')).toHaveAccessibleDescription(/no se pueden abonar/)
  })
})

describe('permisos', () => {
  it('el vendedor no puede entrar a compras', () => {
    simularApi({})
    mostrarRutas(vendedor, '/compras/proveedores')

    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})
