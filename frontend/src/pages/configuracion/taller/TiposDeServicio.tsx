import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../../api/consultas'
import { desglosarError } from '../../../api/errors'
import { crearTipoDeServicio, editarTipoDeServicio, listarTiposDeServicio } from '../../../api/taller'
import type { ServiceType } from '../../../api/types'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { Campo } from '../../../components/Campo'
import { Casilla } from '../../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../../components/EstadoDeCarga'
import { Titulo } from '../../../components/Titulo'
import { formatearPesos } from '../../../utilidades/dinero'
import { PanelLateral } from '../../../components/PanelLateral'

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

  function ir(siguiente: Vista, mensaje: string | null = null) {
    setAviso(mensaje)
    setVista(siguiente)
  }

  const servicio = vista.tipo === 'editar' ? vista.servicio : undefined
  const panel = vista.tipo !== 'lista' && (
    <PanelLateral titulo={servicio ? `Editar «${servicio.name}»` : 'Nuevo tipo de servicio'} modulo="Configuración" descripcion="Un servicio que ofrece el taller, con su código para cobrarlo rápido." onCerrar={() => ir({ tipo: 'lista' })}>
      <FormularioDeTipo servicio={servicio} onTerminar={(m) => ir({ tipo: 'lista' }, m)} onCancelar={() => ir({ tipo: 'lista' })} />
    </PanelLateral>
  )

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Tipos de servicio</Titulo>
        <button type="button" className="boton boton--auto" onClick={() => ir({ tipo: 'crear' })}>
          <Plus aria-hidden="true" size={16} />
          Nuevo tipo de servicio
        </button>
      </div>
      <p className="texto-suave">En la venta se agregan escribiendo su código en el buscador. No se eliminan: se desactivan.</p>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      {tipos.isPending && <Cargando />}
      {tipos.isError && <ErrorDeCarga error={tipos.error} onReintentar={() => void tipos.refetch()} />}
      {tipos.isSuccess &&
        (tipos.data.length === 0 ? (
          <p className="texto-suave">Todavía no hay tipos de servicio.</p>
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
                {tipos.data.map((tipo) => (
                  <tr key={tipo.id} className={tipo.is_active ? undefined : 'tabla__fila--inactiva'}>
                    <td className="tabla__codigo">{tipo.code}</td>
                    <th scope="row">
                      {tipo.name}
                    </th>
                    <td className="tabla__numero">{formatearPesos(tipo.suggested_price)}</td>
                    <td>{tipo.is_active ? 'Activo' : 'Inactivo'}</td>
                    <td className="tabla__acciones">
                      <button type="button" className="boton-enlace" aria-label={`Editar ${tipo.name}`} onClick={() => ir({ tipo: 'editar', servicio: tipo })}>
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
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
