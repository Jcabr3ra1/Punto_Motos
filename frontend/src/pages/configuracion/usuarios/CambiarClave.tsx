import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { desglosarError } from '../../../api/errors'
import type { User } from '../../../api/types'
import { cambiarClave } from '../../../api/usuarios'
import { useUsuario } from '../../../auth/useUsuario'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { Campo } from '../../../components/Campo'

interface Props {
  usuario: User
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}

export function CambiarClave({ usuario, onTerminar, onCancelar }: Props) {
  const esCuentaPropia = useUsuario().id === usuario.id
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [noCoincide, setNoCoincide] = useState(false)

  const guardar = useMutation({
    mutationFn: () => cambiarClave(usuario.id, clave),
    onSuccess: () =>
      onTerminar(
        esCuentaPropia
          ? 'Contraseña actualizada. Tendrás que iniciar sesión de nuevo.'
          : `Contraseña de ${usuario.display_name} actualizada. Tendrá que iniciar sesión de nuevo.`,
      ),
  })

  const error = guardar.isError ? desglosarError(guardar.error) : null

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    if (clave !== repetir) {
      setNoCoincide(true)
      return
    }
    setNoCoincide(false)
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <p className="aviso aviso--info">
        {esCuentaPropia
          ? 'Al cambiarla se cerrará tu sesión y tendrás que entrar con la contraseña nueva.'
          : `Al cambiarla se cierra la sesión de ${usuario.display_name}, si la tiene abierta.`}
      </p>
      <AvisoDeError mensajes={error?.generales ?? []} />
      <Campo
        etiqueta="Contraseña nueva"
        type="password"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        errores={error?.campos.new_password}
        ayuda="Mínimo 8 caracteres, que no sea solo números ni una contraseña común."
        autoComplete="new-password"
        autoFocus
        required
      />
      <Campo
        etiqueta="Repetir contraseña"
        type="password"
        value={repetir}
        onChange={(e) => setRepetir(e.target.value)}
        errores={noCoincide ? ['Las contraseñas no coinciden.'] : undefined}
        autoComplete="new-password"
        required
      />
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
