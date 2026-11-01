import type { ApiError } from './types'

// Cliente HTTP de la API local de Django (docs/backend/API.md#conexión).
// Ninguna de las dos credenciales se guarda en localStorage: viven en memoria.

export interface ApiConfig {
  /** Por ejemplo `http://127.0.0.1:8765/api/v1`. */
  baseUrl: string
  /** Credencial del programa (`X-Punto-Moto-Token`). Opcional en desarrollo. */
  appToken?: string
}

type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Se envía como JSON. */
  body?: unknown
  /** Los valores `undefined`, `null` y vacíos se omiten. */
  query?: Record<string, QueryValue>
  signal?: AbortSignal
}

let config: ApiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8765/api/v1',
  appToken: import.meta.env.VITE_APP_TOKEN || undefined,
}
let sessionToken: string | null = null
let sessionExpiredHandler: (() => void) | null = null

export function configureApi(next: ApiConfig): void {
  config = next
}

export function setSessionToken(token: string | null): void {
  sessionToken = token
}

export function getSessionToken(): string | null {
  return sessionToken
}

/** Se llama cuando la API responde 401 por la sesión: hay que volver al inicio de sesión. */
export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message === 'string'
  )
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const search = params.toString()
  return `${config.baseUrl}${path}${search ? `?${search}` : ''}`
}

function localError(code: string, message: string): ApiError {
  return { code, message, fields: {} }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.appToken) headers['X-Punto-Moto-Token'] = config.appToken
  if (sessionToken) headers.Authorization = `Token ${sessionToken}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw localError(
      'network_error',
      'No se pudo conectar con el programa. Cierra y vuelve a abrir la aplicación.',
    )
  }

  if (response.status === 204) return undefined as T

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }

  if (!response.ok) {
    const error = isApiError(body)
      ? { ...body, fields: body.fields ?? {} }
      : localError('server_error', 'Ocurrió un error inesperado. Intenta de nuevo.')
    if (response.status === 401 && error.code !== 'invalid_app_token') {
      sessionToken = null
      sessionExpiredHandler?.()
    }
    throw error
  }

  return body as T
}
