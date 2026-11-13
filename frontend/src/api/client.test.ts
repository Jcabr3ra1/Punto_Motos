import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  configureApi,
  downloadBlob,
  getSessionToken,
  isApiError,
  onSessionExpired,
  setSessionToken,
} from './client'

const BASE = 'http://127.0.0.1:8765/api/v1'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    configureApi({ baseUrl: BASE, appToken: 'token-programa' })
    setSessionToken(null)
    onSessionExpired(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envía la credencial del programa y no la sesión si no hay inicio de sesión', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }))

    await api('/health')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE}/health`)
    expect(init?.headers).toMatchObject({ 'X-Punto-Moto-Token': 'token-programa' })
    expect(init?.headers).not.toHaveProperty('Authorization')
  })

  it('omite la credencial del programa cuando no está configurada', async () => {
    configureApi({ baseUrl: BASE })
    fetchMock.mockResolvedValue(jsonResponse({}))

    await api('/health')

    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('X-Punto-Moto-Token')
  })

  it('envía el token de sesión con el prefijo Token', async () => {
    setSessionToken('abc123')
    fetchMock.mockResolvedValue(jsonResponse({}))

    await api('/auth/me')

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Token abc123' })
  })

  it('serializa el cuerpo como JSON y usa el método indicado', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: 't' }))

    await api('/auth/login', { method: 'POST', body: { username: 'ana', password: 'x' } })

    const init = fetchMock.mock.calls[0][1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ username: 'ana', password: 'x' }))
  })

  it('arma la consulta y omite los valores vacíos', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }))

    await api('/products', { query: { q: 'pastillas pulsar', category: 3, moto: undefined, page: null, include_inactive: false, empty: '' } })

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${BASE}/products?q=pastillas+pulsar&category=3&include_inactive=false`,
    )
  })

  it('responde undefined con 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('lanza el error de la API con sus campos', async () => {
    const error = {
      code: 'validation_error',
      message: 'Revisa los datos marcados.',
      fields: { name: ['El nombre del negocio es obligatorio.'] },
    }
    fetchMock.mockResolvedValue(jsonResponse(error, 400))

    await expect(api('/settings/business', { method: 'PUT', body: {} })).rejects.toEqual(error)
  })

  it('con 401 de sesión borra el token y avisa para volver al inicio de sesión', async () => {
    const expired = vi.fn()
    onSessionExpired(expired)
    setSessionToken('vencido')
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'authentication_failed', message: 'Sesión vencida.', fields: {} }, 401),
    )

    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'authentication_failed' })

    expect(getSessionToken()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('con 401 invalid_app_token no cierra la sesión del usuario', async () => {
    const expired = vi.fn()
    onSessionExpired(expired)
    setSessionToken('vigente')
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'invalid_app_token', message: 'Credencial inválida.', fields: {} }, 401),
    )

    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'invalid_app_token' })

    expect(getSessionToken()).toBe('vigente')
    expect(expired).not.toHaveBeenCalled()
  })

  it('convierte una respuesta que no es JSON en un error entendible', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))

    const caught = await api('/health').catch((e: unknown) => e)

    expect(isApiError(caught)).toBe(true)
    expect(caught).toMatchObject({ code: 'server_error', fields: {} })
  })

  it('convierte un fallo de red en el error network_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api('/health')).rejects.toMatchObject({ code: 'network_error' })
  })

  it('downloadBlob extrae nombre del archivo y hash de Content-Disposition y X-Backup-Sha256', async () => {
    setSessionToken('mi-sesion')
    fetchMock.mockResolvedValue(
      new Response('sqlite-bytes', {
        status: 200,
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': 'attachment; filename="punto-moto-respaldo-2026-11-13.sqlite3"',
          'X-Backup-Sha256': 'deadbeef1234',
        },
      }),
    )

    const res = await downloadBlob('/backups/download')

    expect(res.filename).toBe('punto-moto-respaldo-2026-11-13.sqlite3')
    expect(res.sha256).toBe('deadbeef1234')
    expect(res.blob.size).toBe(12)
  })

  it('downloadBlob convierte errores HTTP como 403 en ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'permission_denied', message: 'Solo el dueño.', fields: {} }, 403),
    )

    await expect(downloadBlob('/backups/download')).rejects.toMatchObject({ code: 'permission_denied' })
  })
})
