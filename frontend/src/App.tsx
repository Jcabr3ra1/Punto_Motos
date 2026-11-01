import { useEffect, useState } from 'react'
import { api, isApiError } from './api/client'
import type { Health } from './api/types'

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; version: string }
  | { fase: 'error'; mensaje: string }

// Pantalla provisional: solo comprueba la conexión con el backend.
// Se reemplaza en el paso 2 por el asistente del dueño y el inicio de sesión.
export default function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    const controlador = new AbortController()
    api<Health>('/health', { signal: controlador.signal })
      .then((salud) => setEstado({ fase: 'listo', version: salud.version }))
      .catch((error: unknown) => {
        if (controlador.signal.aborted) return
        setEstado({
          fase: 'error',
          mensaje: isApiError(error) ? error.message : 'No se pudo conectar con el programa.',
        })
      })
    return () => controlador.abort()
  }, [])

  return (
    <main className="portada">
      <h1>Punto Moto</h1>
      {estado.fase === 'cargando' && <p>Conectando con el programa…</p>}
      {estado.fase === 'listo' && <p>Programa conectado · versión {estado.version}</p>}
      {estado.fase === 'error' && <p role="alert">{estado.mensaje}</p>}
    </main>
  )
}
