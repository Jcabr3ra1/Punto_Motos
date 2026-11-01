import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../../api/types'
import { dueno, errorDeApi, simularApi, vendedor } from '../../../test/apiSimulada'
import { mostrarRutas } from '../../../test/mostrar'

const luis: User = {
  ...vendedor,
  id: 3,
  username: 'luis',
  first_name: 'Luis',
  last_name: 'Gómez',
  display_name: 'Luis Gómez',
  is_active: false,
  last_login: '2026-10-30T18:56:04-05:00',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}, usuarios: User[] = [vendedor, dueno, luis]) {
  const api = simularApi({ 'GET /users': () => ({ cuerpo: usuarios }), ...rutas })
  mostrarRutas(dueno, '/configuracion/usuarios')
  await screen.findByRole('table')
  return { api, u: userEvent.setup() }
}

describe('lista de usuarios', () => {
  it('muestra cada usuario con su rol, estado y último acceso', async () => {
    await abrir()

    const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(3)
    expect(within(filas[0]).getByText('ana')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Vendedor')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Nunca')).toBeInTheDocument()
    expect(within(filas[2]).getByText('Inactivo')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Activo')).toBeInTheDocument()
  })

  it('avisa si no se pudo cargar y permite reintentar', async () => {
    let intentos = 0
    simularApi({
      'GET /users': () =>
        ++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : { cuerpo: [vendedor] },
    })
    mostrarRutas(dueno, '/configuracion/usuarios')
    const u = userEvent.setup()

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})

describe('crear usuario', () => {
  it('crea al usuario, vuelve a la lista y la muestra actualizada', async () => {
    let usuarios = [vendedor, dueno]
    const creado: User = { ...vendedor, id: 4, username: 'maria', first_name: 'María', last_name: 'Díaz', display_name: 'María Díaz' }
    const { api, u } = await abrir({
      'GET /users': () => ({ cuerpo: usuarios }),
      'POST /users': () => {
        usuarios = [...usuarios, creado]
        return { estado: 201, cuerpo: creado }
      },
    })

    await u.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    await u.type(screen.getByLabelText('Usuario'), 'maria')
    await u.type(screen.getByLabelText('Nombre'), 'María')
    await u.type(screen.getByLabelText('Apellido'), 'Díaz')
    await u.type(screen.getByLabelText('Contraseña'), 'repuestos-maria-7')
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Usuario maria creado.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /users')?.cuerpo).toEqual({
      username: 'maria',
      first_name: 'María',
      last_name: 'Díaz',
      role: 'seller',
      password: 'repuestos-maria-7',
    })
    expect(within(screen.getByRole('table')).getByText('maria')).toBeInTheDocument()
  })

  it('permite crear a otro dueño eligiendo el rol', async () => {
    const { api, u } = await abrir({ 'POST /users': () => ({ estado: 201, cuerpo: { ...dueno, id: 5, username: 'socio' } }) })

    await u.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    await u.type(screen.getByLabelText('Usuario'), 'socio')
    await u.selectOptions(screen.getByLabelText('Rol'), 'owner')
    await u.type(screen.getByLabelText('Contraseña'), 'repuestos-socio-7')
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }))

    await screen.findByText('Usuario socio creado.')
    expect(api.llamadas.find((l) => l.clave === 'POST /users')?.cuerpo).toMatchObject({ role: 'owner' })
  })

  it('muestra el error junto al campo y no sale del formulario', async () => {
    const { u } = await abrir({
      'POST /users': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          username: ['Ya existe un usuario con ese nombre.'],
          password: ['Esta contraseña es demasiado común.'],
        }),
    })

    await u.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    await u.type(screen.getByLabelText('Usuario'), 'ana')
    await u.type(screen.getByLabelText('Contraseña'), '12345678')
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Ya existe un usuario con ese nombre.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/demasiado común/)
    expect(screen.getByLabelText('Usuario')).toHaveValue('ana')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('cancelar vuelve a la lista sin enviar nada', async () => {
    const { api, u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    await u.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(api.cuantas('POST /users')).toBe(0)
  })
})

describe('editar usuario', () => {
  it('cambia el rol y el estado de otro usuario', async () => {
    const { api, u } = await abrir({
      'PATCH /users/3': () => ({ cuerpo: { ...luis, role: 'owner', is_active: true, role_label: 'Dueño' } }),
    })

    await u.click(screen.getByRole('button', { name: 'Editar a Luis Gómez' }))
    expect(screen.getByRole('heading', { name: 'Editar a Luis Gómez' })).toBeInTheDocument()
    await u.selectOptions(screen.getByLabelText('Rol'), 'owner')
    await u.click(screen.getByLabelText('Usuario activo'))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Cambios de Luis Gómez guardados.')).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'PATCH /users/3')?.cuerpo).toEqual({
      first_name: 'Luis',
      last_name: 'Gómez',
      role: 'owner',
      is_active: true,
    })
  })

  it('no deja cambiar el rol ni desactivar la propia cuenta', async () => {
    const { u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Editar a Carlos Pérez' }))

    expect(screen.getByLabelText('Rol')).toBeDisabled()
    expect(screen.getByLabelText('Usuario activo')).toBeDisabled()
    expect(screen.getByText('No puedes desactivar tu propia cuenta.')).toBeInTheDocument()
  })

  it('muestra el error general de la API, por ejemplo que debe quedar un dueño', async () => {
    const otroDueno: User = { ...dueno, id: 6, username: 'socio', display_name: 'Socio Uno' }
    const { u } = await abrir(
      {
        'PATCH /users/6': () =>
          errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
            non_field_errors: ['Debe quedar al menos un dueño activo.'],
          }),
      },
      [dueno, otroDueno],
    )

    await u.click(screen.getByRole('button', { name: 'Editar a Socio Uno' }))
    await u.click(screen.getByLabelText('Usuario activo'))
    await u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Debe quedar al menos un dueño activo.')
  })
})

describe('cambiar contraseña', () => {
  it('no envía nada si las contraseñas no coinciden', async () => {
    const { api, u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Cambiar la contraseña de Ana Ruiz' }))
    await u.type(screen.getByLabelText('Contraseña nueva'), 'repuestos-nuevos-9')
    await u.type(screen.getByLabelText('Repetir contraseña'), 'otra-cosa-distinta')
    await u.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(api.cuantas('POST /users/2/set-password')).toBe(0)
  })

  it('cambia la contraseña y avisa que la persona deberá entrar de nuevo', async () => {
    const { api, u } = await abrir({ 'POST /users/2/set-password': () => ({ estado: 204 }) })

    await u.click(screen.getByRole('button', { name: 'Cambiar la contraseña de Ana Ruiz' }))
    await u.type(screen.getByLabelText('Contraseña nueva'), 'repuestos-nuevos-9')
    await u.type(screen.getByLabelText('Repetir contraseña'), 'repuestos-nuevos-9')
    await u.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText(/Contraseña de Ana Ruiz actualizada\. Tendrá que iniciar sesión de nuevo\./)).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /users/2/set-password')?.cuerpo).toEqual({
      new_password: 'repuestos-nuevos-9',
    })
  })

  it('muestra el error de contraseña junto al campo', async () => {
    const { u } = await abrir({
      'POST /users/2/set-password': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          new_password: ['Esta contraseña es completamente numérica.'],
        }),
    })

    await u.click(screen.getByRole('button', { name: 'Cambiar la contraseña de Ana Ruiz' }))
    await u.type(screen.getByLabelText('Contraseña nueva'), '12345678')
    await u.type(screen.getByLabelText('Repetir contraseña'), '12345678')
    await u.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))

    expect(await screen.findByText('Esta contraseña es completamente numérica.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAccessibleDescription(/numérica/)
  })

  it('advierte que cambiar la propia contraseña cierra la sesión', async () => {
    const { u } = await abrir()

    await u.click(screen.getByRole('button', { name: 'Cambiar la contraseña de Carlos Pérez' }))

    expect(screen.getByText('Al cambiarla se cerrará tu sesión y tendrás que entrar con la contraseña nueva.')).toBeInTheDocument()
  })
})
