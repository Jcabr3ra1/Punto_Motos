import { UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { claves } from '../../../api/consultas'
import type { User } from '../../../api/types'
import { listarUsuarios } from '../../../api/usuarios'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { Titulo } from '../../../components/Titulo'
import { formatearFechaHora } from '../../../utilidades/fechas'
import { CambiarClave } from './CambiarClave'
import { FormularioUsuario } from './FormularioUsuario'
import { PanelLateral } from '../../../components/PanelLateral'

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; id: number }
  | { tipo: 'clave'; id: number }

// Administración de usuarios (solo el dueño). Los formularios ocupan el lugar de la lista.
export function Usuarios() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const consulta = useQuery({
    queryKey: claves.usuarios,
    queryFn: ({ signal }) => listarUsuarios(signal),
  })

  const usuarios = consulta.data ?? []
  const elegido = 'id' in vista ? usuarios.find((u) => u.id === vista.id) : undefined

  function volver(mensaje?: string) {
    setAviso(mensaje ?? null)
    setVista({ tipo: 'lista' })
  }

  return (
    <section>
      <Titulo nivel={2}>Usuarios</Titulo>
      {consulta.isPending && <Cargando />}
      {consulta.isError && <ErrorDeCarga error={consulta.error} onReintentar={() => void consulta.refetch()} />}

      {consulta.isSuccess && (
        <>
          {aviso && (
            <p role="status" className="aviso aviso--exito">
              {aviso}
            </p>
          )}
          <div className="barra-de-acciones">
            <p className="texto-suave">Las personas que pueden entrar al programa. No se eliminan: se desactivan.</p>
            <button
              type="button"
              className="boton boton--auto"
              onClick={() => {
                setAviso(null)
                setVista({ tipo: 'crear' })
              }}
            >
              <UserPlus aria-hidden="true" size={16} />
              Nuevo usuario
            </button>
          </div>
          <TablaDeUsuarios
            usuarios={usuarios}
            onEditar={(u) => {
              setAviso(null)
              setVista({ tipo: 'editar', id: u.id })
            }}
            onCambiarClave={(u) => {
              setAviso(null)
              setVista({ tipo: 'clave', id: u.id })
            }}
          />
        </>
      )}

      {consulta.isSuccess && vista.tipo !== 'lista' && (vista.tipo === 'crear' || elegido) && (
        <PanelLateral
          titulo={
            vista.tipo === 'crear'
              ? 'Nuevo usuario'
              : vista.tipo === 'clave'
                ? `Cambiar la contraseña de ${elegido?.display_name}`
                : `Editar a ${elegido?.display_name}`
          }
          modulo="Configuración"
          descripcion={vista.tipo === 'clave' ? 'Al cambiarla, se cierran sus sesiones abiertas.' : 'Quién entra al programa y qué puede hacer.'}
          onCerrar={() => volver()}
        >
          {vista.tipo === 'crear' ? (
            <FormularioUsuario onTerminar={volver} onCancelar={() => volver()} />
          ) : vista.tipo === 'clave' ? (
            <CambiarClave usuario={elegido!} onTerminar={volver} onCancelar={() => volver()} />
          ) : (
            <FormularioUsuario usuario={elegido} onTerminar={volver} onCancelar={() => volver()} />
          )}
        </PanelLateral>
      )}
    </section>
  )
}

function TablaDeUsuarios({
  usuarios,
  onEditar,
  onCambiarClave,
}: {
  usuarios: User[]
  onEditar: (usuario: User) => void
  onCambiarClave: (usuario: User) => void
}) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Usuarios del programa</caption>
        <thead>
          <tr>
            <th scope="col">Usuario</th>
            <th scope="col">Nombre</th>
            <th scope="col">Rol</th>
            <th scope="col">Estado</th>
            <th scope="col">Último acceso</th>
            <th scope="col">
              <span className="solo-lectores">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => (
            <tr key={usuario.id} className={usuario.is_active ? undefined : 'tabla__fila--inactiva'}>
              <th scope="row">{usuario.username}</th>
              <td>{`${usuario.first_name} ${usuario.last_name}`.trim() || '—'}</td>
              <td>{usuario.role_label}</td>
              <td>{usuario.is_active ? 'Activo' : 'Inactivo'}</td>
              <td>{formatearFechaHora(usuario.last_login)}</td>
              <td className="tabla__acciones">
                <button
                  type="button"
                  className="boton-enlace"
                  aria-label={`Editar a ${usuario.display_name}`}
                  onClick={() => onEditar(usuario)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="boton-enlace"
                  aria-label={`Cambiar la contraseña de ${usuario.display_name}`}
                  onClick={() => onCambiarClave(usuario)}
                >
                  Contraseña
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
