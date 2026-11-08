import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client'
import { desglosarError, type ErrorDeFormulario } from '../../api/errors'
import { useAuth } from '../../auth/useAuth'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoPersonalizado } from '../../components/CampoPersonalizado'
import { MarcoDeAcceso } from './MarcoDeAcceso'

const ESPERA_TRAS_DEMASIADOS_INTENTOS_MS = 10_000

export function InicioDeSesion() {
  const { iniciarSesion, sesionVencida } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [verClave, setVerClave] = useState(false)
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
    <MarcoDeAcceso titulo="Iniciar sesión" descripcion="Entra con tu usuario de Punto Moto.">
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
        <CampoPersonalizado etiqueta="Contraseña" errores={error?.campos.password}>
          {(propiedades) => (
            <span className="campo-con-boton">
              <input
                {...propiedades}
                type={verClave ? 'text' : 'password'}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="campo-con-boton__boton"
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={verClave}
                onClick={() => setVerClave(!verClave)}
              >
                {verClave ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </span>
          )}
        </CampoPersonalizado>
        <button type="submit" className="boton boton--con-icono" disabled={enviando || esperando}>
          {enviando ? 'Entrando…' : esperando ? 'Espera un momento…' : 'Entrar'}
          {!enviando && !esperando && <ArrowRight aria-hidden="true" size={18} />}
        </button>
      </form>
    </MarcoDeAcceso>
  )
}
