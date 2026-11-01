import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client'
import { desglosarError, type ErrorDeFormulario } from '../../api/errors'
import { useAuth } from '../../auth/useAuth'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { MarcoDeAcceso } from './MarcoDeAcceso'

const ESPERA_TRAS_DEMASIADOS_INTENTOS_MS = 10_000

export function InicioDeSesion() {
  const { iniciarSesion, sesionVencida } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [error, setError] = useState<ErrorDeFormulario | null>(null)
  const enviandoRef = useRef(false)

  useEffect(() => {
    if (!esperando) return
    const temporizador = setTimeout(() => setEsperando(false), ESPERA_TRAS_DEMASIADOS_INTENTOS_MS)
    return () => clearTimeout(temporizador)
  }, [esperando])

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    try {
      await iniciarSesion({ username: usuario, password: clave })
    } catch (fallo) {
      setError(desglosarError(fallo))
      if (isApiError(fallo) && fallo.code === 'throttled') setEsperando(true)
      setClave('')
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  return (
    <MarcoDeAcceso titulo="Iniciar sesión">
      {sesionVencida && (
        <p role="status" className="aviso aviso--info">
          Tu sesión terminó. Inicia sesión de nuevo.
        </p>
      )}
      <form onSubmit={alEnviar} noValidate>
        <AvisoDeError mensajes={error?.generales ?? []} />
        <Campo
          etiqueta="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          errores={error?.campos.username}
          autoComplete="username"
          autoFocus
          required
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          errores={error?.campos.password}
          autoComplete="current-password"
          required
        />
        <button type="submit" className="boton" disabled={enviando || esperando}>
          {enviando ? 'Entrando…' : esperando ? 'Espera un momento…' : 'Entrar'}
        </button>
      </form>
    </MarcoDeAcceso>
  )
}
