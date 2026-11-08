import { KeyRound, Pencil, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { claves } from '../../../api/consultas'
import { listarUsuarios } from '../../../api/usuarios'
import { BarraDeFiltros } from '../../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../../components/EstadoVacio'
import { FiltroDeActivos } from '../../../components/FiltroDeActivos'
import { FranjaDeIndicadores } from '../../../components/FranjaDeIndicadores'
import { Paginacion } from '../../../components/Paginacion'
import { useAtajo } from '../../../hooks/useAtajo'
import { useListaLocal } from '../../../hooks/useListaLocal'
import { DESTINOS } from '../../../navegacion/destinos'
import { formatearFechaHora } from '../../../utilidades/fechas'
import { CambiarClave } from './CambiarClave'
import { FormularioUsuario } from './FormularioUsuario'
import { PanelLateral } from '../../../components/PanelLateral'

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; id: number }
  | { tipo: 'clave'; id: number }

// Administración de usuarios (solo el dueño). Libro sin registro: cada usuario se edita en el panel lateral.
export function Usuarios() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const consulta = useQuery({
    queryKey: claves.usuarios,
    queryFn: ({ signal }) => listarUsuarios(signal),
  })

  const usuarios = consulta.data ?? []
  const { lista, porPagina, busqueda, buscar, estado, filtrarEstado, visibles, enPagina, pagina, paginas, setPagina } = useListaLocal(usuarios, (u) => [
    u.username,
    `${u.first_name} ${u.last_name}`,
  ])
  const elegido = 'id' in vista ? usuarios.find((u) => u.id === vista.id) : undefined

  function volver(mensaje?: string) {
    setAviso(mensaje ?? null)
    setVista({ tipo: 'lista' })
  }

  function crear() {
    setAviso(null)
    setVista({ tipo: 'crear' })
  }
  useAtajo('n', crear)

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.usuarios.icono}
        titulo="Usuarios"
        descripcion="Las personas que pueden entrar al programa. No se eliminan: se desactivan."
        acciones={
          <button type="button" className="boton boton--auto boton--con-icono" onClick={crear} aria-keyshortcuts="Control+N">
            <UserPlus aria-hidden="true" size={16} />
            Nuevo usuario
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+N
            </kbd>
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          {
            rotulo: 'Usuarios activos',
            valor: String(usuarios.filter((u) => u.is_active).length),
            cargando: consulta.isPending,
            error: consulta.isError,
          },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <BarraDeFiltros busqueda={{ etiqueta: 'Buscar', placeholder: 'Usuario o nombre', valor: busqueda, onCambiar: buscar }}>
        <FiltroDeActivos valor={estado} onCambiar={filtrarEstado} />
        {consulta.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {visibles.length === 1 ? '1 usuario' : `${visibles.length} usuarios`}
          </p>
        )}
      </BarraDeFiltros>

      {/* Sin detalle por fila: cada usuario se edita en el panel lateral. */}
      <div className="libro libro--sin-registro">
        <section ref={lista} className="libro__lista" aria-label="Lista de usuarios">
          {consulta.isPending && <Cargando />}
          {consulta.isError && <ErrorDeCarga error={consulta.error} onReintentar={() => void consulta.refetch()} />}
          {consulta.isSuccess &&
            (visibles.length === 0 ? (
              <EstadoVacio icono={DESTINOS.usuarios.icono} mensaje="Ningún usuario coincide con los filtros." />
            ) : (
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
                    {enPagina.map((usuario) => (
                      <tr key={usuario.id} className={usuario.is_active ? undefined : 'tabla__fila--inactiva'}>
                        <th scope="row">{usuario.username}</th>
                        <td>{`${usuario.first_name} ${usuario.last_name}`.trim() || '—'}</td>
                        <td>{usuario.role_label}</td>
                        <td>{usuario.is_active ? 'Activo' : 'Inactivo'}</td>
                        <td>{formatearFechaHora(usuario.last_login)}</td>
                        <td className="tabla__acciones">
                          <button
                            type="button"
                            className="boton-icono"
                            aria-label={`Editar a ${usuario.display_name}`}
                            title="Editar"
                            onClick={() => {
                              setAviso(null)
                              setVista({ tipo: 'editar', id: usuario.id })
                            }}
                          >
                            <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            className="boton-icono"
                            aria-label={`Cambiar la contraseña de ${usuario.display_name}`}
                            title="Cambiar la contraseña"
                            onClick={() => {
                              setAviso(null)
                              setVista({ tipo: 'clave', id: usuario.id })
                            }}
                          >
                            <KeyRound aria-hidden="true" size={16} strokeWidth={1.75} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {consulta.isSuccess && (
            <Paginacion
              etiqueta="Páginas de usuarios"
              pagina={pagina}
              total={visibles.length}
              tamano={porPagina}
              hayAnterior={pagina > 1}
              haySiguiente={pagina < paginas}
              onCambiar={setPagina}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
      </div>

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
