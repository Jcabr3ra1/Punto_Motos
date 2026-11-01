import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api, getSessionToken } from './api/client'
import { dueno, errorDeApi, necesitaDueno, salud, simularApi, type Respuesta } from './test/apiSimulada'

const sesion = { token: 'tok-1', user: dueno }

afterEach(() => {
  vi.unstubAllGlobals()
})

async function llenarInicioDeSesion(usuario: string, clave: string) {
  const u = userEvent.setup()
  await u.type(await screen.findByLabelText('Usuario'), usuario)
  await u.type(screen.getByLabelText('Contraseña'), clave)
  return u
}

describe('arranque', () => {
  it('muestra el asistente del dueño cuando falta crearlo', async () => {
    simularApi({ 'GET /health': salud, 'GET /setup/status': necesitaDueno(true) })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Bienvenido a Punto Moto' })).toBeInTheDocument()
  })

  it('muestra el inicio de sesión cuando el dueño ya existe', async () => {
    simularApi({ 'GET /health': salud, 'GET /setup/status': necesitaDueno(false) })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('avisa si no hay conexión y permite reintentar', async () => {
    let intentos = 0
    simularApi({
      'GET /health': () => (++intentos === 1 ? errorDeApi(500, 'server_error', 'Fallo del programa.') : salud()),
      'GET /setup/status': necesitaDueno(false),
    })
    const u = userEvent.setup()

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
    await u.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  })
})

describe('asistente del dueño', () => {
  const rutas = {
    'GET /health': salud,
    'GET /setup/status': necesitaDueno(true),
  }

  async function llenarAsistente(clave: string, repetir: string) {
    const u = userEvent.setup()
    await u.type(await screen.findByLabelText('Usuario'), 'dueno')
    await u.type(screen.getByLabelText('Nombre'), 'Carlos')
    await u.type(screen.getByLabelText('Apellido'), 'Pérez')
    await u.type(screen.getByLabelText('Contraseña'), clave)
    await u.type(screen.getByLabelText('Repetir contraseña'), repetir)
    return u
  }

  it('crea al dueño, abre su sesión y lo saluda', async () => {
    const api = simularApi({ ...rutas, 'POST /setup/owner': () => ({ estado: 201, cuerpo: sesion }) })
    render(<App />)

    const u = await llenarAsistente('taller-moto-2026', 'taller-moto-2026')
    await u.click(screen.getByRole('button', { name: 'Crear cuenta del dueño' }))

    expect(await screen.findByRole('heading', { name: 'Hola, Carlos Pérez' })).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /setup/owner')?.cuerpo).toEqual({
      username: 'dueno',
      first_name: 'Carlos',
      last_name: 'Pérez',
      password: 'taller-moto-2026',
    })
    expect(getSessionToken()).toBe('tok-1')
  })

  it('no envía nada si las contraseñas no coinciden', async () => {
    const api = simularApi({ ...rutas, 'POST /setup/owner': () => ({ estado: 201, cuerpo: sesion }) })
    render(<App />)

    const u = await llenarAsistente('taller-moto-2026', 'otra-distinta-1')
    await u.click(screen.getByRole('button', { name: 'Crear cuenta del dueño' }))

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(api.cuantas('POST /setup/owner')).toBe(0)
  })

  it('muestra cada error de la API junto a su campo', async () => {
    simularApi({
      ...rutas,
      'POST /setup/owner': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          password: ['Esta contraseña es demasiado común.'],
        }),
    })
    render(<App />)

    const u = await llenarAsistente('12345678', '12345678')
    await u.click(screen.getByRole('button', { name: 'Crear cuenta del dueño' }))

    const error = await screen.findByText('Esta contraseña es demasiado común.')
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(/demasiado común/)
    expect(error).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear cuenta del dueño' })).toBeEnabled()
  })
})

describe('inicio de sesión', () => {
  const rutas = { 'GET /health': salud, 'GET /setup/status': necesitaDueno(false) }

  it('abre la sesión con las credenciales correctas', async () => {
    const api = simularApi({ ...rutas, 'POST /auth/login': () => ({ cuerpo: sesion }) })
    render(<App />)

    const u = await llenarInicioDeSesion('dueno', 'taller-moto-2026')
    await u.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Hola, Carlos Pérez' })).toBeInTheDocument()
    expect(api.llamadas.find((l) => l.clave === 'POST /auth/login')?.cuerpo).toEqual({
      username: 'dueno',
      password: 'taller-moto-2026',
    })
  })

  it('muestra el error general y vacía la contraseña si las credenciales fallan', async () => {
    simularApi({
      ...rutas,
      'POST /auth/login': () =>
        errorDeApi(400, 'validation_error', 'Revisa los datos marcados.', {
          non_field_errors: ['Usuario o contraseña incorrectos.'],
        }),
    })
    render(<App />)

    const u = await llenarInicioDeSesion('dueno', 'mala-clave-1')
    await u.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
    expect(screen.getByLabelText('Usuario')).toHaveValue('dueno')
  })

  it('envía una sola vez aunque se pulse el botón varias veces', async () => {
    let terminar: (r: Respuesta) => void = () => {}
    const api = simularApi({
      ...rutas,
      'POST /auth/login': () => new Promise<Respuesta>((resolver) => (terminar = resolver)),
    })
    render(<App />)

    const u = await llenarInicioDeSesion('dueno', 'taller-moto-2026')
    const boton = screen.getByRole('button', { name: 'Entrar' })
    await u.dblClick(boton)
    await u.click(boton)

    expect(api.cuantas('POST /auth/login')).toBe(1)
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()

    await act(async () => terminar({ cuerpo: sesion }))
    expect(await screen.findByRole('heading', { name: 'Hola, Carlos Pérez' })).toBeInTheDocument()
  })

  it('bloquea el botón un momento tras demasiados intentos', async () => {
    simularApi({
      ...rutas,
      'POST /auth/login': () => errorDeApi(429, 'throttled', 'Demasiados intentos. Espera un momento.'),
    })
    render(<App />)

    const u = await llenarInicioDeSesion('dueno', 'taller-moto-2026')
    await u.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos. Espera un momento.')
    expect(screen.getByRole('button', { name: 'Espera un momento…' })).toBeDisabled()
  })
})

describe('con la sesión abierta', () => {
  const rutas = {
    'GET /health': salud,
    'GET /setup/status': necesitaDueno(false),
    'POST /auth/login': () => ({ cuerpo: sesion }),
  }

  async function entrar() {
    render(<App />)
    const u = await llenarInicioDeSesion('dueno', 'taller-moto-2026')
    await u.click(screen.getByRole('button', { name: 'Entrar' }))
    await screen.findByRole('heading', { name: 'Hola, Carlos Pérez' })
    return u
  }

  it('parte de Inicio aunque haya quedado la dirección del usuario anterior', async () => {
    simularApi(rutas)
    window.location.hash = '#/configuracion/usuarios'

    await entrar()

    expect(window.location.hash).toBe('')
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
  })

  it('cierra la sesión: avisa al backend, borra el token y vuelve al inicio de sesión', async () => {
    const api = simularApi({ ...rutas, 'POST /auth/logout': () => ({ estado: 204 }) })
    const u = await entrar()

    await u.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(api.cuantas('POST /auth/logout')).toBe(1)
    expect(getSessionToken()).toBeNull()
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument()
  })

  it('si la sesión vence, vuelve al inicio de sesión con un aviso', async () => {
    simularApi({
      ...rutas,
      'GET /auth/me': () => errorDeApi(401, 'authentication_failed', 'Sesión vencida.'),
    })
    await entrar()

    await act(async () => {
      await api('/auth/me').catch(() => undefined)
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument())
    expect(screen.getByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument()
    expect(getSessionToken()).toBeNull()
  })
})
