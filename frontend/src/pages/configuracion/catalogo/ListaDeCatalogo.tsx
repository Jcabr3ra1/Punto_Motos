import { Pencil } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listarCatalogo, type ElementoDeCatalogo, type TipoDeCatalogo } from '../../../api/catalogo'
import { claves } from '../../../api/consultas'
import { BarraDeFiltros } from '../../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { EstadoVacio } from '../../../components/EstadoVacio'
import { FiltroDeActivos } from '../../../components/FiltroDeActivos'
import { Paginacion } from '../../../components/Paginacion'
import { PanelLateral } from '../../../components/PanelLateral'
import { useListaLocal } from '../../../hooks/useListaLocal'
import { DESTINOS } from '../../../navegacion/destinos'
import { FormularioDeCatalogo } from './FormularioDeCatalogo'

export interface SeccionDeCatalogo {
  tipo: TipoDeCatalogo
  etiqueta: string
  nuevo: string
  creado: (nombre: string) => string
  conSigla: boolean
  ayudaSigla?: string
  descripcion: string
}

/** «1 tipo», «2 marcas», «3 motos». */
function cantidad(n: number, seccion: SeccionDeCatalogo): string {
  const singular = { categories: 'tipo', brands: 'marca', motos: 'moto' }[seccion.tipo]
  return n === 1 ? `1 ${singular}` : `${n} ${seccion.etiqueta.toLowerCase()}`
}

interface Props {
  seccion: SeccionDeCatalogo
  /** «Nuevo tipo / marca / moto» se pulsa en el encabezado de la pantalla. */
  creando: boolean
  onCerrarCreacion: () => void
}

export function ListaDeCatalogo({ seccion, creando, onCerrarCreacion }: Props) {
  const [editando, setEditando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const consulta = useQuery({
    queryKey: claves.catalogoCompleto(seccion.tipo),
    queryFn: ({ signal }) => listarCatalogo<ElementoDeCatalogo>(seccion.tipo, { incluirInactivos: true, signal }),
  })

  const elementos = consulta.data ?? []
  // La API entrega la lista completa: buscar, filtrar por estado y paginar se hace aquí.
  const { lista, porPagina, busqueda, buscar, estado, filtrarEstado, visibles, enPagina, pagina: actual, paginas, setPagina } =
    useListaLocal(elementos, (e) => [e.name, e.abbreviation ?? ''])
  const elegido = editando === null ? undefined : elementos.find((e) => e.id === editando)

  function volver(mensaje?: string) {
    setAviso(mensaje ?? null)
    setEditando(null)
    onCerrarCreacion()
  }

  const panel = (creando || elegido) && (
    <PanelLateral
      titulo={elegido ? `Editar «${elegido.name}»` : seccion.nuevo}
      modulo="Configuración"
      descripcion={seccion.descripcion}
      onCerrar={() => volver()}
    >
      <FormularioDeCatalogo seccion={seccion} elemento={elegido} onTerminar={volver} onCancelar={() => volver()} />
    </PanelLateral>
  )

  return (
    <>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <BarraDeFiltros
        busqueda={{
          etiqueta: 'Buscar',
          placeholder: seccion.conSigla ? 'Nombre o sigla' : 'Nombre',
          valor: busqueda,
          onCambiar: buscar,
        }}
      >
        <FiltroDeActivos valor={estado} onCambiar={filtrarEstado} />
        {consulta.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {cantidad(visibles.length, seccion)}
          </p>
        )}
      </BarraDeFiltros>

      {/* Sin detalle por fila: cada registro se edita en el panel lateral. */}
      <div className="libro libro--sin-registro">
        <section ref={lista} className="libro__lista" aria-label={`Lista de ${seccion.etiqueta.toLowerCase()}`}>
          {consulta.isPending && <Cargando />}
          {consulta.isError && <ErrorDeCarga error={consulta.error} onReintentar={() => void consulta.refetch()} />}
          {consulta.isSuccess &&
            (visibles.length === 0 ? (
              <EstadoVacio
                icono={DESTINOS.catalogo.icono}
                mensaje={
                  elementos.length === 0
                    ? `Todavía no hay registros en ${seccion.etiqueta.toLowerCase()}.`
                    : `Ningún registro de ${seccion.etiqueta.toLowerCase()} coincide con los filtros.`
                }
              />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">{seccion.etiqueta}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      {seccion.conSigla && <th scope="col">Sigla</th>}
                      <th scope="col">Estado</th>
                      <th scope="col" className="tabla__acciones">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enPagina.map((elemento) => (
                      <tr key={elemento.id} className={elemento.is_active ? undefined : 'tabla__fila--inactiva'}>
                        <th scope="row">{elemento.name}</th>
                        {seccion.conSigla && (
                          <td>
                            <span className="tabla__codigo">{elemento.abbreviation}</span>
                          </td>
                        )}
                        <td>{elemento.is_active ? 'Activo' : 'Inactivo'}</td>
                        <td className="tabla__acciones">
                          <button
                            type="button"
                            className="boton-icono"
                            aria-label={`Editar «${elemento.name}»`}
                            title="Editar"
                            onClick={() => {
                              setAviso(null)
                              setEditando(elemento.id)
                            }}
                          >
                            <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
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
              etiqueta={`Páginas de ${seccion.etiqueta.toLowerCase()}`}
              pagina={actual}
              total={visibles.length}
              tamano={porPagina}
              hayAnterior={actual > 1}
              haySiguiente={actual < paginas}
              onCambiar={setPagina}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
      </div>
      {panel}
    </>
  )
}
