import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../../api/consultas'
import { desglosarError } from '../../../api/errors'
import { crearMecanico, editarMecanico, listarMecanicos } from '../../../api/taller'
import type { Mechanic } from '../../../api/types'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { Campo } from '../../../components/Campo'
import { Casilla } from '../../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../../components/FranjaDeIndicadores'
import { useAtajo } from '../../../hooks/useAtajo'
import { DESTINOS } from '../../../navegacion/destinos'
import { PanelLateral } from '../../../components/PanelLateral'
import { EstadoVacio } from '../../../components/EstadoVacio'

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; mecanico: Mechanic }

// Mecánicos (solo el dueño). Son registros de empleado: no inician sesión. Su porcentaje de la mano de obra
// es el propio o el general de Datos del negocio. No se borran: se desactivan.
export function Mecanicos() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const mecanicos = useQuery({
    queryKey: claves.mecanicos(true),
    queryFn: ({ signal }) => listarMecanicos(true, signal),
  })

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
    <>
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
      {mecanicos.isPending && <Cargando />}
      {mecanicos.isError && <ErrorDeCarga error={mecanicos.error} onReintentar={() => void mecanicos.refetch()} />}
      {mecanicos.isSuccess &&
        (mecanicos.data.length === 0 ? (
          <EstadoVacio icono={DESTINOS.mecanicos.icono} mensaje="Todavía no hay mecánicos." />
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
                {mecanicos.data.map((mecanico) => (
                  <tr key={mecanico.id} className={mecanico.is_active ? undefined : 'tabla__fila--inactiva'}>
                    <th scope="row">{mecanico.name}</th>
                    <td>{mecanico.phone || '—'}</td>
                    <td>
                      {mecanico.effective_percentage ?? '—'} %
                      <span className="tabla__detalle">{mecanico.labor_percentage == null ? 'El general' : 'Propio'}</span>
                    </td>
                    <td>{mecanico.is_active ? 'Activo' : 'Inactivo'}</td>
                    <td className="tabla__acciones">
                      <button type="button" className="boton-enlace" aria-label={`Editar a ${mecanico.name}`} onClick={() => ir({ tipo: 'editar', mecanico })}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {panel}
    </>
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
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
