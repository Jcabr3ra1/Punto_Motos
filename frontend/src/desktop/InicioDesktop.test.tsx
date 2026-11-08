import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../App'
import { BASE, necesitaDueno, salud, simularApi } from '../test/apiSimulada'
import { InicioDesktop } from './InicioDesktop'

const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

it('en navegador mantiene el acceso habitual sin necesitar Tauri', async () => {
  isTauri.mockReturnValue(false)
  simularApi({ 'GET /health': salud, 'GET /setup/status': necesitaDueno(false) })
  render(<InicioDesktop><App /></InicioDesktop>)
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(invoke).not.toHaveBeenCalled()
})

it('no consulta Django hasta recibir la dirección y credencial de escritorio', async () => {
  isTauri.mockReturnValue(true)
  let resolver!: (value: unknown) => void
  invoke.mockImplementation(() => new Promise((resolve) => { resolver = resolve }))
  const solicitudes: { url: string; token: string | null }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    solicitudes.push({ url, token: new Headers(init.headers).get('X-Punto-Moto-Token') })
    return new Response(JSON.stringify(url.endsWith('/health') ? salud().cuerpo : { needs_owner: false }))
  })
  render(<InicioDesktop><App /></InicioDesktop>)
  expect(screen.getByRole('status')).toHaveTextContent('Preparando')
  expect(solicitudes).toEqual([])

  await act(async () => resolver({
    phase: 'ready',
    config: { baseUrl: 'http://127.0.0.1:49123/api/v1', appToken: 'credencial-efimera' },
  }))
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  // Las dos primeras son las del arranque; después, el inicio de sesión vuelve a consultar /health para su punto de
  // conexión. Todas llevan la credencial de escritorio.
  expect(solicitudes.slice(0, 2)).toEqual([
    { url: 'http://127.0.0.1:49123/api/v1/health', token: 'credencial-efimera' },
    { url: 'http://127.0.0.1:49123/api/v1/setup/status', token: 'credencial-efimera' },
  ])
  expect(solicitudes.every((s) => s.url.startsWith('http://127.0.0.1:49123/api/v1/') && s.token === 'credencial-efimera')).toBe(true)
})

it('espera mientras Rust informa que Django está arrancando', async () => {
  isTauri.mockReturnValue(true)
  const { llamadas } = simularApi({ 'GET /health': salud, 'GET /setup/status': necesitaDueno(false) })
  invoke.mockResolvedValueOnce({ phase: 'starting' }).mockResolvedValue({
    phase: 'ready', config: { baseUrl: BASE, appToken: 'nuevo-token' },
  })
  render(<InicioDesktop><App /></InicioDesktop>)
  expect(llamadas).toEqual([])
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(invoke.mock.calls.every(([command]) => command === 'desktop_status')).toBe(true)
})

it('muestra un fallo y reconsulta el estado sin montar App antes de tiempo', async () => {
  isTauri.mockReturnValue(true)
  const { llamadas } = simularApi({ 'GET /health': salud, 'GET /setup/status': necesitaDueno(false) })
  invoke.mockRejectedValueOnce('Fallo del puente').mockResolvedValueOnce({
    phase: 'failed', message: 'No se encontró Python. Cierra el programa y revisa el entorno.',
  })
  const u = userEvent.setup()
  render(<InicioDesktop><App /></InicioDesktop>)
  expect(await screen.findByRole('alert')).toHaveTextContent('escritorio')
  await u.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró Python')
  expect(llamadas).toEqual([])
  expect(invoke.mock.calls).toEqual([['desktop_status'], ['desktop_status']])
})

it('ignora una respuesta de escritorio después de desmontar', async () => {
  isTauri.mockReturnValue(true)
  let resolver!: (value: unknown) => void
  invoke.mockImplementation(() => new Promise((resolve) => { resolver = resolve }))
  const { llamadas } = simularApi({})
  const vista = render(<InicioDesktop><App /></InicioDesktop>)
  vista.unmount()
  await act(async () => resolver({ phase: 'ready', config: { baseUrl: BASE, appToken: 'viejo' } }))
  await waitFor(() => expect(llamadas).toEqual([]))
})
