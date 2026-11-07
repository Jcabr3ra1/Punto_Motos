import { Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listarCatalogo, type ElementoDeCatalogo, type TipoDeCatalogo } from '../../../api/catalogo'
import { claves } from '../../../api/consultas'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { FormularioDeCatalogo } from './FormularioDeCatalogo'
import { PanelLateral } from '../../../components/PanelLateral'

export interface SeccionDeCatalogo {
  tipo: TipoDeCatalogo
  etiqueta: string
  nuevo: string
  creado: (nombre: string) => string
  conSigla: boolean
  ayudaSigla?: string
  descripcion: string
}

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; id: number }

export function ListaDeCatalogo({ seccion }: { seccion: SeccionDeCatalogo }) {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const consulta = useQuery({
    queryKey: claves.catalogoCompleto(seccion.tipo),
    queryFn: ({ signal }) => listarCatalogo<ElementoDeCatalogo>(seccion.tipo, { incluirInactivos: true, signal }),
  })

  const elementos = consulta.data ?? []
  const elegido = vista.tipo === 'editar' ? elementos.find((e) => e.id === vista.id) : undefined

  function volver(mensaje?: string) {
    setAviso(mensaje ?? null)
    setVista({ tipo: 'lista' })
  }

  if (consulta.isPending) return <Cargando />
  if (consulta.isError) return <ErrorDeCarga error={consulta.error} onReintentar={() => void consulta.refetch()} />

  const panel = (vista.tipo === 'crear' || (vista.tipo === 'editar' && elegido)) && (
    <PanelLateral
      titulo={vista.tipo === 'editar' && elegido ? `Editar «${elegido.name}»` : seccion.nuevo}
      modulo="Configuración"
      descripcion={seccion.descripcion}
      onCerrar={() => volver()}
    >
      <FormularioDeCatalogo seccion={seccion} elemento={vista.tipo === 'editar' ? elegido : undefined} onTerminar={volver} onCancelar={() => volver()} />
    </PanelLateral>
  )

  return (
    <>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <div className="barra-de-acciones">
        <p className="texto-suave">{seccion.descripcion} No se eliminan: se desactivan.</p>
        <button
          type="button"
          className="boton boton--auto"
          onClick={() => {
            setAviso(null)
            setVista({ tipo: 'crear' })
          }}
        >
          <Plus aria-hidden="true" size={16} />
          {seccion.nuevo}
        </button>
      </div>
      {elementos.length === 0 ? (
        <p className="texto-suave">Todavía no hay registros en {seccion.etiqueta.toLowerCase()}.</p>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <caption className="solo-lectores">{seccion.etiqueta}</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                {seccion.conSigla && <th scope="col">Sigla</th>}
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {elementos.map((elemento) => (
                <tr key={elemento.id} className={elemento.is_active ? undefined : 'tabla__fila--inactiva'}>
                  <th scope="row">{elemento.name}</th>
                  {seccion.conSigla && <td>{elemento.abbreviation}</td>}
                  <td>{elemento.is_active ? 'Activo' : 'Inactivo'}</td>
                  <td className="tabla__acciones">
                    <button
                      type="button"
                      className="boton-enlace"
                      aria-label={`Editar «${elemento.name}»`}
                      onClick={() => {
                        setAviso(null)
                        setVista({ tipo: 'editar', id: elemento.id })
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {panel}
    </>
  )
}
