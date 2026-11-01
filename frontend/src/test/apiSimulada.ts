import { vi } from 'vitest'
import { configureApi, onSessionExpired, setSessionToken } from '../api/client'
import type { User } from '../api/types'

export const BASE = 'http://127.0.0.1:8765/api/v1'

export const dueno: User = {
  id: 1,
  username: 'dueno',
  first_name: 'Carlos',
  last_name: 'Pérez',
  display_name: 'Carlos Pérez',
  role: 'owner',
  role_label: 'Dueño',
  is_active: true,
  last_login: null,
}

export type Respuesta = { estado?: number; cuerpo?: unknown }
export type Manejador = (cuerpo: unknown) => Respuesta | Promise<Respuesta>

/** Simula la API: cada clave es `MÉTODO /ruta`; las llamadas sin manejador responden 404. */
export function simularApi(rutas: Record<string, Manejador>) {
  const llamadas: { clave: string; cuerpo: unknown }[] = []

  const fetchSimulado = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const ruta = String(url).replace(BASE, '')
    const clave = `${init?.method ?? 'GET'} ${ruta}`
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined
    llamadas.push({ clave, cuerpo })

    const manejador = rutas[clave]
    if (!manejador) {
      return new Response(JSON.stringify({ code: 'not_found', message: 'No existe.', fields: {} }), { status: 404 })
    }
    const { estado = 200, cuerpo: respuesta } = await manejador(cuerpo)
    if (estado === 204) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(respuesta), {
      status: estado,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  vi.stubGlobal('fetch', fetchSimulado)
  configureApi({ baseUrl: BASE })
  setSessionToken(null)
  onSessionExpired(null)

  return { llamadas, cuantas: (clave: string) => llamadas.filter((l) => l.clave === clave).length }
}

export const salud = () => ({ cuerpo: { status: 'ok', version: '0.3.0', server_time: '2026-11-01T08:00:00-05:00' } })
export const necesitaDueno = (necesita: boolean) => () => ({ cuerpo: { needs_owner: necesita } })
export const errorDeApi = (estado: number, code: string, message: string, fields = {}) => ({
  estado,
  cuerpo: { code, message, fields },
})
