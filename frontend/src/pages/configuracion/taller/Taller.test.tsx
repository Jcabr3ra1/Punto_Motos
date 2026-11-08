import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi, vendedor } from '../../../test/apiSimulada'
import { mecanico, tipoDeServicio } from '../../../test/datos'
import { mostrarRutas } from '../../../test/mostrar'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tipos de servicio', () => {
  it('lista con código, mano de obra sugerida y estado', async () => {
    simularApi({ 'GET /service-types?include_inactive=true': () => ({ cuerpo: [tipoDeServicio(), tipoDeServicio({ id: 2, code: 999, name: 'Otro', suggested_price: 0, is_active: false })] }) })
    mostrarRutas(dueno, '/configuracion/servicios')

    const fila = await screen.findByRole('row', { name: /Cambio de aceite/ })
    expect(fila).toHaveTextContent('101')
    expect(fila).toHaveTextContent(/\$\s?15\.000/)
    expect(screen.getByRole('row', { name: /Otro/ })).toHaveTextContent('Inactivo')
  })

  it('crea un tipo y muestra el error de código repetido', async () => {
    let intento = 0
    const api = simularApi({
      'GET /service-types?include_inactive=true': () => ({ cuerpo: [] }),
      'POST /service-types': () =>
        ++intento === 1
          ? errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', { code: ['Ya existe un tipo de servicio con ese código.'] })
          : { estado: 201, cuerpo: tipoDeServicio({ id: 3, code: 102, name: 'Ajuste de frenos', suggested_price: 12000 }) },
    })
    mostrarRutas(dueno, '/configuracion/servicios')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Nuevo tipo de servicio' }))
    await u.type(screen.getByLabelText('Código'), '101')
    await u.type(screen.getByLabelText('Mano de obra sugerida'), '12000')
    await u.type(screen.getByLabelText('Nombre'), 'Ajuste de frenos')
    await u.click(screen.getByRole('button', { name: 'Crear tipo de servicio' }))
    expect(await screen.findByText('Ya existe un tipo de servicio con ese código.')).toBeInTheDocument()

    await u.clear(screen.getByLabelText('Código'))
    await u.type(screen.getByLabelText('Código'), '102')
    await u.click(screen.getByRole('button', { name: 'Crear tipo de servicio' }))
    expect(await screen.findByText('Servicio 102 «Ajuste de frenos» creado.')).toBeInTheDocument()
    expect(api.llamadas.filter((l) => l.clave === 'POST /service-types').at(-1)?.cuerpo).toEqual({
      code: 102,
      name: 'Ajuste de frenos',
      suggested_price: 12000,
    })
  })
})

describe('mecánicos', () => {
  it('Nuevo mecánico se abre en un panel', async () => {
    simularApi({ 'GET /mechanics?include_inactive=true': () => ({ cuerpo: [mecanico()] }) })
    mostrarRutas(dueno, '/configuracion/mecanicos')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Nuevo mecánico' }))

    expect(screen.getByRole('dialog', { name: 'Nuevo mecánico' })).toBeInTheDocument()
  })

  it('busca por nombre sin tildes, filtra por estado y deja el pie fijo', async () => {
    simularApi({
      'GET /mechanics?include_inactive=true': () => ({
        cuerpo: [mecanico(), mecanico({ id: 2, name: 'Pedro Gómez', is_active: false })],
      }),
    })
    mostrarRutas(dueno, '/configuracion/mecanicos')
    const u = userEvent.setup()
    await screen.findByRole('row', { name: /Carlos Ruiz/ })

    await u.type(screen.getByLabelText('Buscar'), 'gomez')
    expect(screen.queryByRole('row', { name: /Carlos Ruiz/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 mecánico')).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Buscar'))
    await u.click(screen.getByRole('button', { name: 'Activos' }))
    expect(screen.queryByRole('row', { name: /Pedro Gómez/ })).not.toBeInTheDocument()

    const pie = screen.getByRole('navigation', { name: 'Páginas de mecánicos' })
    expect(within(pie).getByRole('button', { name: 'Atrás' })).toBeDisabled()
  })

  it('muestra el porcentaje con que se liquida y si es propio o el general', async () => {
    simularApi({
      'GET /mechanics?include_inactive=true': () => ({
        cuerpo: [mecanico(), mecanico({ id: 2, name: 'Pedro Gómez', phone: '', labor_percentage: null, effective_percentage: 60 })],
      }),
    })
    mostrarRutas(dueno, '/configuracion/mecanicos')

    expect(await screen.findByRole('row', { name: /Carlos Ruiz/ })).toHaveTextContent('70 %Propio')
    expect(screen.getByRole('row', { name: /Pedro Gómez/ })).toHaveTextContent('60 %El general')
  })

  it('el porcentaje vacío se envía como null para usar el general', async () => {
    const api = simularApi({
      'GET /mechanics?include_inactive=true': () => ({ cuerpo: [mecanico()] }),
      'PATCH /mechanics/1': () => ({ cuerpo: mecanico({ labor_percentage: null, effective_percentage: 60 }) }),
    })
    mostrarRutas(dueno, '/configuracion/mecanicos')
    const u = userEvent.setup()

    await u.click(await screen.findByRole('button', { name: 'Editar a Carlos Ruiz' }))
    await u.clear(screen.getByLabelText('Porcentaje propio'))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Cambios de Carlos Ruiz guardados.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'PATCH /mechanics/1')?.cuerpo).toMatchObject({ labor_percentage: null })
  })

  it('el vendedor no ve estas pestañas ni entra a ellas', () => {
    simularApi({ 'GET /settings/business': () => ({ cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', default_mechanic_percentage: 60, updated_at: 'x' } }) })
    mostrarRutas(vendedor, '/taller/mecanicos')

    expect(within(screen.getByRole('navigation', { name: 'Principal' })).queryByRole('link', { name: 'Mecánicos' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
  })
})
