import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { isApiError } from '../../../api/client'
import { claves } from '../../../api/consultas'
import { desglosarError } from '../../../api/errors'
import { crearMecanico, editarMecanico, eliminarMecanico, listarMecanicos } from '../../../api/taller'
import type { Mechanic } from '../../../api/types'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { BarraDeFiltros } from '../../../components/BarraDeFiltros'
import { Campo } from '../../../components/Campo'
import { Casilla } from '../../../components/Casilla'
import { DialogoDeConfirmacion } from '../../../components/DialogoDeConfirmacion'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../../components/FranjaDeIndicadores'
import { useAtajo } from '../../../hooks/useAtajo'
import { DESTINOS } from '../../../navegacion/destinos'
import { PanelLateral } from '../../../components/PanelLateral'
import { EstadoVacio } from '../../../components/EstadoVacio'
import { FiltroDeActivos } from '../../../components/FiltroDeActivos'
import { Paginacion } from '../../../components/Paginacion'
import { useListaLocal } from '../../../hooks/useListaLocal'

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; mecanico: Mechanic }

// Mecánicos (solo el dueño). Son registros de empleado: no inician sesión. Su porcentaje de la mano de obra
// es el propio o el general de Datos del negocio. Los que nunca tuvieron servicios se pueden borrar; con historial se desactivan.
export function Mecanicos() {
  const clienteDeConsultas = useQueryClient()
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<Mechanic | null>(null)
  const mecanicos = useQuery({
    queryKey: claves.mecanicos(true),
    queryFn: ({ signal }) => listarMecanicos(true, signal),
  })
  const eliminar = useMutation({
    mutationFn: (m: Mechanic) => eliminarMecanico(m.id),
    onSuccess: async (_, borrado) => {
      setEliminando(null)
      setAviso(`Mecánico «${borrado.name}» eliminado.`)
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.taller })
    },
  })
  const desactivar = useMutation({
    mutationFn: (m: Mechanic) => editarMecanico(m.id, { is_active: false }),
    onSuccess: async (desactivado) => {
      setEliminando(null)
      setAviso(`Mecánico «${desactivado.name}» desactivado.`)
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.taller })
    },
  })
  const falloEliminar = desactivar.error ?? eliminar.error
  const errorEliminar = falloEliminar ? desglosarError(falloEliminar) : null
  const tieneHistorial = isApiError(eliminar.error) && eliminar.error.code === 'mechanic_has_history'
  const { lista, porPagina, busqueda, buscar, estado, filtrarEstado, visibles, enPagina, pagina, paginas, setPagina } =
    useListaLocal(mecanicos.data ?? [], (m) => [m.name, m.phone ?? ''])

  function ir(siguiente: Vista, mensaje: string | null = null) {
    setAviso(mensaje)
    setVista(siguiente)
  }
  useAtajo('n', () => ir({ tipo: 'crear' }))

  const mecanico = vista.tipo === 'editar' ? vista.mecanico : undefined
  const panel = vista.tipo !== 'lista' && (
    <PanelLateral titulo={mecanico ? `Editar a ${mecanico.name}` : 'Nuevo mecánico'} modulo="Taller" descripcion="Su parte de la mano de obra se liquida al final del día." onCerrar={() => ir({ tipo: 'lista' })}>
      <FormularioDeMecanico mecanico={mecanico} onTerminar={(m) => ir({ tipo: 'lista' }, m)} onCancelar={() => ir({ tipo: 'lista' })} />
    </PanelLateral>
  )

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.mecanicos.icono}
        titulo="Mecánicos"
        descripcion="No inician sesión en el programa: se eligen en cada servicio de la venta."
        acciones={
          <button
            type="button"
            className="boton boton--auto boton--con-icono"
            onClick={() => ir({ tipo: 'crear' })}
            aria-keyshortcuts="Control+N"
          >
            <Plus aria-hidden="true" size={16} />
            Nuevo mecánico
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+N
            </kbd>
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          {
            rotulo: 'Mecánicos activos',
            valor: String(mecanicos.data?.filter((uno) => uno.is_active).length ?? 0),
            cargando: mecanicos.isPending,
            error: mecanicos.isError,
          },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <BarraDeFiltros
        busqueda={{ etiqueta: 'Buscar', placeholder: 'Nombre o teléfono', valor: busqueda, onCambiar: buscar }}
      >
        <FiltroDeActivos valor={estado} onCambiar={filtrarEstado} />
        {mecanicos.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {visibles.length === 1 ? '1 mecánico' : `${visibles.length} mecánicos`}
          </p>
        )}
      </BarraDeFiltros>

      {/* Sin detalle por fila: cada registro se edita en el panel lateral. */}
      <div className="libro libro--sin-registro">
        <section ref={lista} className="libro__lista" aria-label="Lista de mecánicos">
          {mecanicos.isPending && <Cargando />}
          {mecanicos.isError && <ErrorDeCarga error={mecanicos.error} onReintentar={() => void mecanicos.refetch()} />}
          {mecanicos.isSuccess &&
            (visibles.length === 0 ? (
              <EstadoVacio
                icono={DESTINOS.mecanicos.icono}
                mensaje={mecanicos.data.length === 0 ? 'Todavía no hay mecánicos.' : 'Ninguno coincide con los filtros.'}
              />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Mecánicos</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Teléfono</th>
                      <th scope="col">Porcentaje de la mano de obra</th>
                      <th scope="col">Estado</th>
                      <th scope="col">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enPagina.map((mecanico) => (
                      <tr key={mecanico.id} className={mecanico.is_active ? undefined : 'tabla__fila--inactiva'}>
                        <th scope="row">{mecanico.name}</th>
                        <td>{mecanico.phone || '—'}</td>
                        <td>
                          {mecanico.effective_percentage ?? '—'} %
                          <span className="tabla__detalle">{mecanico.labor_percentage == null ? 'El general' : 'Propio'}</span>
                        </td>
                        <td>{mecanico.is_active ? 'Activo' : 'Inactivo'}</td>
                        <td className="tabla__acciones">
                          <button type="button" className="boton-icono" aria-label={`Editar a ${mecanico.name}`} title="Editar" onClick={() => ir({ tipo: 'editar', mecanico })}>
                            <Pencil aria-hidden="true" size={16} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            className="boton-icono boton-icono--peligro"
                            aria-label={`Eliminar a ${mecanico.name}`}
                            title="Eliminar"
                            onClick={() => {
                              setAviso(null)
                              eliminar.reset()
                              desactivar.reset()
                              setEliminando(mecanico)
                            }}
                          >
                            <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {mecanicos.isSuccess && (
            <Paginacion
              etiqueta="Páginas de mecánicos"
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
      {eliminando && (
        <DialogoDeConfirmacion
          titulo={`¿Eliminar a ${eliminando.name}?`}
          accion={eliminar.isPending ? 'Eliminando…' : 'Sí, eliminar'}
          cancelar="Volver"
          peligro
          ocupado={eliminar.isPending || desactivar.isPending}
          onConfirmar={() => {
            desactivar.reset()
            eliminar.mutate(eliminando)
          }}
          onCancelar={() => {
            eliminar.reset()
            desactivar.reset()
            setEliminando(null)
          }}
          otrasAcciones={
            tieneHistorial &&
            eliminando.is_active && (
              <button
                type="button"
                className="boton boton--secundario boton--auto"
                disabled={desactivar.isPending || eliminar.isPending}
                onClick={() => desactivar.mutate(eliminando)}
              >
                {desactivar.isPending ? 'Desactivando…' : 'Desactivar mecánico'}
              </button>
            )
          }
        >
          <p>Solo se puede eliminar si nunca ha tenido servicios, liquidaciones ni descuentos. Si ya tiene historial, puedes desactivarlo.</p>
          <AvisoDeError mensajes={errorEliminar?.generales ?? []} />
        </DialogoDeConfirmacion>
      )}
    </section>
  )
}

function FormularioDeMecanico({
  mecanico,
  onTerminar,
  onCancelar,
}: {
  mecanico?: Mechanic
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}) {
  const clienteDeConsultas = useQueryClient()
  const editando = mecanico !== undefined
  const [nombre, setNombre] = useState(mecanico?.name ?? '')
  const [telefono, setTelefono] = useState(mecanico?.phone ?? '')
  const [porcentaje, setPorcentaje] = useState(mecanico?.labor_percentage == null ? '' : String(mecanico.labor_percentage))
  const [activo, setActivo] = useState(mecanico?.is_active ?? true)

  const guardar = useMutation({
    mutationFn: () => {
      // Vacío envía null: usa el porcentaje general.
      const datos = { name: nombre, phone: telefono, labor_percentage: porcentaje === '' ? null : Number(porcentaje) }
      return editando ? editarMecanico(mecanico.id, { ...datos, is_active: activo }) : crearMecanico(datos)
    },
    onSuccess: async (guardado) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.taller })
      onTerminar(editando ? `Cambios de ${guardado.name} guardados.` : `Mecánico ${guardado.name} creado.`)
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
      <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} errores={error?.campos.name} maxLength={80} autoComplete="off" autoFocus required />
      <div className="campos-en-fila">
        <Campo etiqueta="Teléfono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} errores={error?.campos.phone} maxLength={30} autoComplete="off" />
        <Campo
          etiqueta="Porcentaje propio"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          value={porcentaje}
          onChange={(e) => setPorcentaje(e.target.value)}
          errores={error?.campos.labor_percentage}
          ayuda="Vacío: usa el porcentaje general de Datos del negocio."
        />
      </div>
      {editando && (
        <Casilla
          etiqueta="Mecánico activo"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          ayuda="Si lo desactivas no aparece en la venta. Se le pueden seguir liquidando servicios pendientes."
        />
      )}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear mecánico'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
