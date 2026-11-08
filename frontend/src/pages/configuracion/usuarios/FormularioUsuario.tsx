import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../../api/consultas'
import { desglosarError } from '../../../api/errors'
import type { Role, User } from '../../../api/types'
import { crearUsuario, editarUsuario } from '../../../api/usuarios'
import { useUsuario } from '../../../auth/useUsuario'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { Campo } from '../../../components/Campo'
import { CampoSelector } from '../../../components/CampoSelector'
import { Casilla } from '../../../components/Casilla'

const ROLES = [
  { valor: 'seller', texto: 'Vendedor' },
  { valor: 'owner', texto: 'Dueño' },
] as const

interface Props {
  /** Si se recibe, se edita ese usuario; si no, se crea uno nuevo. */
  usuario?: User
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}

export function FormularioUsuario({ usuario, onTerminar, onCancelar }: Props) {
  const sesion = useUsuario()
  const clienteDeConsultas = useQueryClient()
  const editando = usuario !== undefined
  // Quien edita su propia cuenta no puede cambiarse el rol ni desactivarse: se quedaría sin acceso.
  const esCuentaPropia = usuario?.id === sesion.id

  const [nombreDeUsuario, setNombreDeUsuario] = useState('')
  const [nombre, setNombre] = useState(usuario?.first_name ?? '')
  const [apellido, setApellido] = useState(usuario?.last_name ?? '')
  const [rol, setRol] = useState<Role>(usuario?.role ?? 'seller')
  const [activo, setActivo] = useState(usuario?.is_active ?? true)
  const [clave, setClave] = useState('')

  const guardar = useMutation({
    mutationFn: () =>
      editando
        ? editarUsuario(usuario.id, { first_name: nombre, last_name: apellido, role: rol, is_active: activo })
        : crearUsuario({
            username: nombreDeUsuario,
            first_name: nombre,
            last_name: apellido,
            role: rol,
            password: clave,
          }),
    onSuccess: async (guardado) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.usuarios })
      onTerminar(editando ? `Cambios de ${guardado.display_name} guardados.` : `Usuario ${guardado.username} creado.`)
    },
  })

  const error = guardar.isError ? desglosarError(guardar.error) : null

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <AvisoDeError mensajes={error?.generales ?? []} />
      {editando ? (
        <p>
          Usuario: <strong>{usuario.username}</strong>
        </p>
      ) : (
        <Campo
          etiqueta="Usuario"
          value={nombreDeUsuario}
          onChange={(e) => setNombreDeUsuario(e.target.value)}
          errores={error?.campos.username}
          ayuda="Con este nombre entrará al programa. No se puede cambiar después."
          autoComplete="off"
          autoFocus
          required
        />
      )}
      <div className="campos-en-fila">
        <Campo
          etiqueta="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          errores={error?.campos.first_name}
          autoComplete="off"
          autoFocus={editando}
        />
        <Campo
          etiqueta="Apellido"
          value={apellido}
          onChange={(e) => setApellido(e.target.value)}
          errores={error?.campos.last_name}
          autoComplete="off"
        />
      </div>
      <CampoSelector
        etiqueta="Rol"
        opciones={ROLES}
        value={rol}
        onChange={(e) => setRol(e.target.value as Role)}
        errores={error?.campos.role}
        disabled={esCuentaPropia}
        ayuda={esCuentaPropia ? 'No puedes cambiar el rol de tu propia cuenta.' : undefined}
      />
      {editando && (
        <Casilla
          etiqueta="Usuario activo"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          disabled={esCuentaPropia}
          ayuda={
            esCuentaPropia
              ? 'No puedes desactivar tu propia cuenta.'
              : 'Si lo desactivas, se cierra su sesión y no podrá entrar. Sus ventas y registros se conservan.'
          }
        />
      )}
      {!editando && (
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
      )}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
