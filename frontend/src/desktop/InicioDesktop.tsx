import { invoke, isTauri } from '@tauri-apps/api/core'
import { useEffect, useState, type ReactNode } from 'react'
import { configureApi, type ApiConfig } from '../api/client'
import { Conectando, SinConexion } from '../pages/acceso/PantallaDeConexion'

type EstadoDesktop =
  | { phase: 'starting' }
  | { phase: 'ready'; config: ApiConfig }
  | { phase: 'failed'; message: string }

export function InicioDesktop({ children }: { children: ReactNode }) {
  const [esDesktop] = useState(isTauri)
  const [listo, setListo] = useState(!esDesktop)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!esDesktop) return
    let cancelado = false
    let temporizador: ReturnType<typeof setTimeout> | undefined
    const limite = Date.now() + 70_000

    async function consultar() {
      try {
        const estado = await invoke<EstadoDesktop>('desktop_status')
        if (cancelado) return
        if (estado.phase === 'ready') {
          configureApi(estado.config)
          setListo(true)
        } else if (estado.phase === 'failed') {
          setError(estado.message)
        } else if (Date.now() >= limite) {
          setError('El programa tardó demasiado en iniciar. Cierra y vuelve a abrir la aplicación.')
        } else {
          temporizador = setTimeout(() => { void consultar() }, 200)
        }
      } catch {
        if (!cancelado) setError('No se pudo consultar el inicio de escritorio. Cierra y vuelve a abrir la aplicación si el problema continúa.')
      }
    }

    void consultar()
    return () => {
      cancelado = true
      clearTimeout(temporizador)
    }
  }, [esDesktop, intento])

  if (listo) return children
  if (error) return <SinConexion mensaje={error} onReintentar={() => {
    setError(null)
    setIntento((n) => n + 1)
  }} />
  return <Conectando />
}
