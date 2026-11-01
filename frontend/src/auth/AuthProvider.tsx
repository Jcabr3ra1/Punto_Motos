import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { isApiError, onSessionExpired, setSessionToken } from '../api/client'
import type { Session } from '../api/types'
import { ContextoAuth, type EstadoAcceso } from './contexto'

// Flujo de inicio del programa (docs/backend/API.md#flujo-de-inicio-del-programa):
// /health → /setup/status → asistente del dueño o inicio de sesión.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAcceso>({ fase: 'conectando' })
  const [sesionVencida, setSesionVencida] = useState(false)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const controlador = new AbortController()
    const { signal } = controlador

    async function arrancar() {
      setEstado({ fase: 'conectando' })
      try {
        await authApi.consultarSalud(signal)
        const { needs_owner } = await authApi.consultarEstadoInicial(signal)
        if (!signal.aborted) setEstado({ fase: needs_owner ? 'primer-uso' : 'sin-sesion' })
      } catch (error) {
        if (signal.aborted) return
        setEstado({
          fase: 'sin-conexion',
          mensaje: isApiError(error) ? error.message : 'No se pudo conectar con el programa.',
        })
      }
    }

    void arrancar()
    return () => controlador.abort()
  }, [intento])

  useEffect(() => {
    onSessionExpired(() => {
      setSesionVencida(true)
      setEstado({ fase: 'sin-sesion' })
    })
    return () => onSessionExpired(null)
  }, [])

  const abrirSesion = useCallback((sesion: Session) => {
    setSessionToken(sesion.token)
    setSesionVencida(false)
    setEstado({ fase: 'con-sesion', usuario: sesion.user })
  }, [])

  const valor = useMemo(
    () => ({
      estado,
      sesionVencida,
      reintentar: () => setIntento((n) => n + 1),
      iniciarSesion: async (datos: Parameters<typeof authApi.iniciarSesion>[0]) =>
        abrirSesion(await authApi.iniciarSesion(datos)),
      crearPrimerDueno: async (datos: Parameters<typeof authApi.crearPrimerDueno>[0]) =>
        abrirSesion(await authApi.crearPrimerDueno(datos)),
      cerrarSesion: async () => {
        try {
          await authApi.cerrarSesion()
        } catch {
          // Aunque el backend no responda, la sesión local se cierra igual.
        }
        setSessionToken(null)
        setSesionVencida(false)
        setEstado({ fase: 'sin-sesion' })
      },
    }),
    [estado, sesionVencida, abrirSesion],
  )

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>
}
