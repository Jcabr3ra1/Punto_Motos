import { useRef, useState, type FormEvent } from 'react'
import { desglosarError, type ErrorDeFormulario } from '../../api/errors'
import { useAuth } from '../../auth/useAuth'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { MarcoDeAcceso } from './MarcoDeAcceso'

// Asistente de primer uso: crea al dueño, que queda con la sesión abierta.
export function AsistenteDelDueno() {
  const { crearPrimerDueno } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [clave, setClave] = useState('')
  const [repetirClave, setRepetirClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<ErrorDeFormulario | null>(null)
  const enviandoRef = useRef(false)

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (enviandoRef.current) return

    if (clave !== repetirClave) {
      setError({ generales: [], campos: { repetir: ['Las contraseñas no coinciden.'] } })
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    try {
      await crearPrimerDueno({
        username: usuario,
        first_name: nombre,
        last_name: apellido,
        password: clave,
      })
    } catch (fallo) {
      setError(desglosarError(fallo))
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  return (
    <MarcoDeAcceso
      titulo="Bienvenido a Punto Moto"
      descripcion="Crea la cuenta del dueño. Con ella se administran los usuarios, los precios y el negocio."
    >
      <form onSubmit={alEnviar} noValidate>
        <AvisoDeError mensajes={error?.generales ?? []} />
        <Campo
          etiqueta="Usuario"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          errores={error?.campos.username}
          ayuda="Con este nombre entrarás al programa."
          autoComplete="username"
          autoFocus
          required
        />
        <div className="campos-en-fila">
          <Campo
            etiqueta="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            errores={error?.campos.first_name}
            autoComplete="given-name"
          />
          <Campo
            etiqueta="Apellido"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            errores={error?.campos.last_name}
            autoComplete="family-name"
          />
        </div>
        <Campo
          etiqueta="Contraseña"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          errores={error?.campos.password}
          ayuda="Mínimo 8 caracteres, que no sea solo números ni una contraseña común."
          autoComplete="new-password"
          required
        />
        <Campo
          etiqueta="Repetir contraseña"
          type="password"
          value={repetirClave}
          onChange={(e) => setRepetirClave(e.target.value)}
          errores={error?.campos.repetir}
          autoComplete="new-password"
          required
        />
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Creando cuenta…' : 'Crear cuenta del dueño'}
        </button>
      </form>
    </MarcoDeAcceso>
  )
}
