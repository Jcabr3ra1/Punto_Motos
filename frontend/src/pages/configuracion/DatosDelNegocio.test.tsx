import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dueno, errorDeApi, simularApi, vendedor, type Respuesta } from '../../test/apiSimulada'
import { mostrarRutas } from '../../test/mostrar'

const negocio = {
  name: 'Punto Moto',
  tax_id: '900123456',
  address: 'Calle 1 # 2-3',
  phone: '3001234567',
  receipt_footer: 'Gracias por su compra',
  default_mechanic_percentage: 60,
  updated_at: '2026-11-01T08:00:00-05:00',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Datos del negocio (dueño)', () => {
  it('muestra los datos guardados y no deja guardar sin cambios', async () => {
    simularApi({ 'GET /settings/business': () => ({ cuerpo: negocio }) })
    mostrarRutas(dueno, '/configuracion/negocio')

    expect(await screen.findByLabelText('Nombre del negocio')).toHaveValue('Punto Moto')
    expect(screen.getByLabelText('NIT o cédula')).toHaveValue('900123456')
    expect(screen.getByLabelText('Mensaje al pie del recibo')).toHaveValue('Gracias por su compra')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })

  it('guarda el formulario completo y confirma que se guardó', async () => {
    const api = simularApi({
      'GET /settings/business': () => ({ cuerpo: negocio }),
      'PUT /settings/business': (cuerpo) => ({ cuerpo: { ...(cuerpo as object), updated_at: '2026-11-01T09:00:00-05:00' } }),
    })
    mostrarRutas(dueno, '/configuracion/negocio')
    const u = userEvent.setup()

    const nombre = await screen.findByLabelText('Nombre del negocio')
    await u.clear(nombre)
    await u.type(nombre, 'Punto Moto Taller')
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Datos guardados.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'PUT /settings/business')?.cuerpo).toEqual({
      name: 'Punto Moto Taller',
      tax_id: '900123456',
      address: 'Calle 1 # 2-3',
      phone: '3001234567',
      receipt_footer: 'Gracias por su compra',
      default_mechanic_percentage: 60,
    })
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })

  it('quita el aviso de guardado cuando se vuelve a editar', async () => {
    simularApi({
      'GET /settings/business': () => ({ cuerpo: negocio }),
      'PUT /settings/business': (cuerpo) => ({ cuerpo: { ...(cuerpo as object), updated_at: 'x' } }),
    })
    mostrarRutas(dueno, '/configuracion/negocio')
    const u = userEvent.setup()

    await u.type(await screen.findByLabelText('Teléfono'), '5')
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText('Datos guardados.')
    await u.type(screen.getByLabelText('Teléfono'), '6')

    expect(screen.queryByText('Datos guardados.')).not.toBeInTheDocument()
  })

  it('muestra el error junto al campo y conserva lo escrito', async () => {
    simularApi({
      'GET /settings/business': () => ({ cuerpo: { ...negocio, name: '' } }),
      'PUT /settings/business': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          name: ['El nombre del negocio es obligatorio.'],
        }),
    })
    mostrarRutas(dueno, '/configuracion/negocio')
    const u = userEvent.setup()

    const direccion = await screen.findByLabelText('Dirección')
    await u.clear(direccion)
    await u.type(direccion, 'Carrera 5')
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('El nombre del negocio es obligatorio.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del negocio')).toHaveAccessibleDescription(/obligatorio/)
    expect(screen.getByLabelText('Dirección')).toHaveValue('Carrera 5')
    expect(screen.queryByText('Datos guardados.')).not.toBeInTheDocument()
  })

  it('envía una sola vez aunque se pulse el botón varias veces', async () => {
    let terminar: (r: Respuesta) => void = () => {}
    const api = simularApi({
      'GET /settings/business': () => ({ cuerpo: negocio }),
      'PUT /settings/business': () => new Promise<Respuesta>((resolver) => (terminar = resolver)),
    })
    mostrarRutas(dueno, '/configuracion/negocio')
    const u = userEvent.setup()

    await u.type(await screen.findByLabelText('Teléfono'), '9')
    const boton = screen.getByRole('button', { name: 'Guardar cambios' })
    await u.dblClick(boton)
    await u.click(boton)

    expect(api.cuantas('PUT /settings/business')).toBe(1)
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()

    await act(async () => terminar({ cuerpo: { ...negocio, phone: '30012345679' } }))
    expect(await screen.findByText('Datos guardados.')).toBeInTheDocument()
  })

  it('avisa si no se pudieron cargar los datos y permite reintentar', async () => {
    let intentos = 0
    simularApi({
      'GET /settings/business': () =>
        ++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { cuerpo: negocio },
    })
    mostrarRutas(dueno, '/configuracion/negocio')
    const u = userEvent.setup()

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByLabelText('Nombre del negocio')).toHaveValue('Punto Moto')
  })
})

describe('porcentaje general de los mecánicos', () => {
  it('el dueño lo cambia y se envía como número', async () => {
    const api = simularApi({
      'GET /settings/business': () => ({ cuerpo: negocio }),
      'PUT /settings/business': (cuerpo) => ({ cuerpo: { ...(cuerpo as object), updated_at: 'x' } }),
    })
    mostrarRutas(dueno, '/configuracion/negocio')
    const u = userEvent.setup()

    const campo = await screen.findByLabelText('Porcentaje general de los mecánicos')
    expect(campo).toHaveValue(60)
    await u.clear(campo)
    await u.type(campo, '55')
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText('Datos guardados.')
    expect(api.llamadas.find((l) => l.clave === 'PUT /settings/business')?.cuerpo).toMatchObject({ default_mechanic_percentage: 55 })
  })
})

describe('Datos del negocio (vendedor)', () => {
  it('ve los datos en solo lectura y sin botón de guardar', async () => {
    simularApi({ 'GET /settings/business': () => ({ cuerpo: negocio }) })
    mostrarRutas(vendedor, '/configuracion/negocio')

    const nombre = await screen.findByLabelText('Nombre del negocio')
    expect(nombre).toHaveValue('Punto Moto')
    expect(nombre).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Mensaje al pie del recibo')).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
    expect(screen.getByText('Solo el dueño puede cambiar estos datos.')).toBeInTheDocument()
  })
})
