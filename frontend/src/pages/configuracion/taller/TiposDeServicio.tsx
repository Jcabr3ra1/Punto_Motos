import { Pencil, Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../../api/consultas'
import { desglosarError } from '../../../api/errors'
import { crearTipoDeServicio, editarTipoDeServicio, listarTiposDeServicio } from '../../../api/taller'
import type { ServiceType } from '../../../api/types'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { BarraDeFiltros } from '../../../components/BarraDeFiltros'
import { Campo } from '../../../components/Campo'
import { Casilla } from '../../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../../components/FranjaDeIndicadores'
import { useAtajo } from '../../../hooks/useAtajo'
import { DESTINOS } from '../../../navegacion/destinos'
import { formatearPesos } from '../../../utilidades/dinero'
import { PanelLateral } from '../../../components/PanelLateral'
import { EstadoVacio } from '../../../components/EstadoVacio'
import { FiltroDeActivos } from '../../../components/FiltroDeActivos'
import { Paginacion } from '../../../components/Paginacion'
import { useListaLocal } from '../../../hooks/useListaLocal'

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; servicio: ServiceType }

// Tipos de servicio del taller (solo el dueño). El código numérico es el que se escribe en la venta.
// No se borran: se desactivan.
export function TiposDeServicio() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const tipos = useQuery({
    queryKey: claves.tiposDeServicio(true),
    queryFn: ({ signal }) => listarTiposDeServicio(true, signal),
  })
  const { lista, porPagina, busqueda, buscar, estado, filtrarEstado, visibles, enPagina, pagina, paginas, setPagina } =
    useListaLocal(tipos.data ?? [], (t) => [String(t.code), t.name])

  function ir(siguiente: Vista, mensaje: string | null = null) {
    setAviso(mensaje)
    setVista(siguiente)
  }
  useAtajo('n', () => ir({ tipo: 'crear' }))

  const servicio = vista.tipo === 'editar' ? vista.servicio : undefined
  const panel = vista.tipo !== 'lista' && (
    <PanelLateral titulo={servicio ? `Editar «${servicio.name}»` : 'Nuevo tipo de servicio'} modulo="Taller" descripcion="Un servicio que ofrece el taller, con su código para cobrarlo rápido." onCerrar={() => ir({ tipo: 'lista' })}>
      <FormularioDeTipo servicio={servicio} onTerminar={(m) => ir({ tipo: 'lista' }, m)} onCancelar={() => ir({ tipo: 'lista' })} />
    </PanelLateral>
  )

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.tiposDeServicio.icono}
        titulo="Tipos de servicio"
        descripcion="En la venta se agregan escribiendo su código en el buscador. No se eliminan: se desactivan."
        acciones={
          <button
            type="button"
            className="boton boton--auto boton--con-icono"
            onClick={() => ir({ tipo: 'crear' })}
            aria-keyshortcuts="Control+N"
          >
            <Plus aria-hidden="true" size={16} />
            Nuevo tipo de servicio
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+N
            </kbd>
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          {
            rotulo: 'Servicios activos',
            valor: String(tipos.data?.filter((uno) => uno.is_active).length ?? 0),
            cargando: tipos.isPending,
            error: tipos.isError,
          },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <BarraDeFiltros
        busqueda={{ etiqueta: 'Buscar', placeholder: 'Código o nombre', valor: busqueda, onCambiar: buscar }}
      >
        <FiltroDeActivos valor={estado} onCambiar={filtrarEstado} />
        {tipos.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {visibles.length === 1 ? '1 tipo de servicio' : `${visibles.length} tipos de servicio`}
          </p>
        )}
      </BarraDeFiltros>

      {/* Sin detalle por fila: cada registro se edita en el panel lateral. */}
      <div className="libro libro--sin-registro">
        <section ref={lista} className="libro__lista" aria-label="Lista de tipos de servicio">
          {tipos.isPending && <Cargando />}
          {tipos.isError && <ErrorDeCarga error={tipos.error} onReintentar={() => void tipos.refetch()} />}
          {tipos.isSuccess &&
            (visibles.length === 0 ? (
              <EstadoVacio
                icono={DESTINOS.tiposDeServicio.icono}
                mensaje={tipos.data.length === 0 ? 'Todavía no hay tipos de servicio.' : 'Ninguno coincide con los filtros.'}
              />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Tipos de servicio</caption>
                  <thead>
                    <tr>
                      <th scope="col">Código</th>
                      <th scope="col">Servicio</th>
                      <th scope="col" className="tabla__numero">
                        Mano de obra sugerida
                      </th>
                      <th scope="col">Estado</th>
                      <th scope="col">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enPagina.map((tipo) => (
                      <tr key={tipo.id} className={tipo.is_active ? undefined : 'tabla__fila--inactiva'}>
                        <td>
                          <span className="tabla__codigo">{tipo.code}</span>
                        </td>
                        <th scope="row">
                          {tipo.name}
                        </th>
                        <td className="tabla__numero">{formatearPesos(tipo.suggested_price)}</td>
                        <td>{tipo.is_active ? 'Activo' : 'Inactivo'}</td>
                        <td className="tabla__acciones">
                          <button type="button" className="boton-icono" aria-label={`Editar ${tipo.name}`} title="Editar" onClick={() => ir({ tipo: 'editar', servicio: tipo })}>
                            <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {tipos.isSuccess && (
            <Paginacion
              etiqueta="Páginas de tipos de servicio"
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
      {panel}
    </section>
  )
}

function FormularioDeTipo({
  servicio,
  onTerminar,
  onCancelar,
}: {
  servicio?: ServiceType
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}) {
  const clienteDeConsultas = useQueryClient()
  const editando = servicio !== undefined
  const [codigo, setCodigo] = useState(servicio ? String(servicio.code) : '')
  const [nombre, setNombre] = useState(servicio?.name ?? '')
  const [precio, setPrecio] = useState(servicio ? String(servicio.suggested_price) : '')
  const [activo, setActivo] = useState(servicio?.is_active ?? true)

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        ...(codigo !== '' ? { code: Number(codigo) } : {}),
        name: nombre,
        ...(precio !== '' ? { suggested_price: Number(precio) } : {}),
      }
      return editando ? editarTipoDeServicio(servicio.id, { ...datos, is_active: activo }) : crearTipoDeServicio(datos)
    },
    onSuccess: async (guardado) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.taller })
      onTerminar(editando ? `Cambios de «${guardado.name}» guardados.` : `Servicio ${guardado.code} «${guardado.name}» creado.`)
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
      <div className="campos-en-fila">
        <Campo
          etiqueta="Código"
          type="number"
          inputMode="numeric"
          min={1}
          max={99999}
          step={1}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          errores={error?.campos.code}
          ayuda="Un número corto, por ejemplo 101."
          autoFocus
          required
        />
        <Campo
          etiqueta="Mano de obra sugerida"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          errores={error?.campos.suggested_price}
          ayuda="En pesos. Se propone en la venta."
          required
        />
      </div>
      <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} errores={error?.campos.name} maxLength={80} autoComplete="off" required />
      {editando && <Casilla etiqueta="Activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} />}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear tipo de servicio'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
