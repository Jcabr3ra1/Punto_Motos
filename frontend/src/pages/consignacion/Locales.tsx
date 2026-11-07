import { Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { crearLocal, editarLocal, listarLocales, pendientesDeLocal } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { Consignee } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Casilla } from '../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { useDebounce } from '../../hooks/useDebounce'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { PanelLateral } from '../../components/PanelLateral'

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; local: Consignee } | { tipo: 'tiene'; local: Consignee }

// Locales que venden mercancía del negocio en consignación (solo el dueño). No se borran: se desactivan.
export function Locales() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [conDeuda, setConDeuda] = useState(false)
  const [desactivados, setDesactivados] = useState(false)
  const filtros = { q: useDebounce(busqueda), with_debt: conDeuda, include_inactive: desactivados }
  const locales = useQuery({
    queryKey: [...claves.consignacion, 'locales', filtros],
    queryFn: ({ signal }) => listarLocales(filtros, signal),
  })

  function ir(siguiente: Vista, mensaje: string | null = null) {
    setAviso(mensaje)
    setVista(siguiente)
  }

  const local = vista.tipo === 'editar' ? vista.local : undefined
  const panel = (vista.tipo === 'crear' || vista.tipo === 'editar') && (
    <PanelLateral
      titulo={local ? `Editar «${local.name}»` : 'Nuevo local'}
      modulo="Consignación"
      descripcion="Otro local que recibe mercancía para vender y la paga después."
      onCerrar={() => ir({ tipo: 'lista' })}
    >
      <FormularioDeLocal local={local} onTerminar={(m) => ir({ tipo: 'lista' }, m)} onCancelar={() => ir({ tipo: 'lista' })} />
    </PanelLateral>
  )

  if (vista.tipo === 'tiene') {
    return (
      <>
        <div className="barra-de-acciones">
          <Titulo nivel={2}>Lo que tiene «{vista.local.name}»</Titulo>
          <button type="button" className="boton boton--secundario boton--auto" onClick={() => ir({ tipo: 'lista' })}>
            Volver a los locales
          </button>
        </div>
        <LoQueTiene localId={vista.local.id} />
      </>
    )
  }

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Locales</Titulo>
        <button type="button" className="boton boton--auto" onClick={() => ir({ tipo: 'crear' })}>
          <Plus aria-hidden="true" size={16} />
          Nuevo local
        </button>
      </div>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <div className="filtros" role="search" aria-label="Filtrar locales">
        <Campo etiqueta="Buscar" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o NIT" autoComplete="off" />
      </div>
      <div className="filtros__casillas">
        <Casilla etiqueta="Solo los que deben" checked={conDeuda} onChange={(e) => setConDeuda(e.target.checked)} />
        <Casilla etiqueta="Mostrar desactivados" checked={desactivados} onChange={(e) => setDesactivados(e.target.checked)} />
      </div>
      {locales.isPending && <Cargando />}
      {locales.isError && <ErrorDeCarga error={locales.error} onReintentar={() => void locales.refetch()} />}
      {locales.isSuccess &&
        (locales.data.length === 0 ? (
          <p className="texto-suave">{busqueda || conDeuda ? 'Ningún local coincide con los filtros.' : 'Todavía no hay locales.'}</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Locales en consignación</caption>
              <thead>
                <tr>
                  <th scope="col">Local</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col" className="tabla__numero">
                    Debe
                  </th>
                  <th scope="col">
                    <span className="solo-lectores">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {locales.data.map((local) => (
                  <tr key={local.id} className={local.is_active ? undefined : 'tabla__fila--inactiva'}>
                    <th scope="row">
                      {local.name}
                      {(local.tax_id || !local.is_active) && (
                        <span className="tabla__detalle">{[local.tax_id, !local.is_active && 'Desactivado'].filter(Boolean).join(' · ')}</span>
                      )}
                    </th>
                    <td>{local.phone || '—'}</td>
                    <td className="tabla__numero">{local.balance_due > 0 ? <strong>{formatearPesos(local.balance_due)}</strong> : formatearPesos(0)}</td>
                    <td className="tabla__acciones">
                      <button type="button" className="boton-enlace" aria-label={`Lo que tiene ${local.name}`} onClick={() => ir({ tipo: 'tiene', local })}>
                        Lo que tiene
                      </button>
                      <button type="button" className="boton-enlace" aria-label={`Editar ${local.name}`} onClick={() => ir({ tipo: 'editar', local })}>
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

function FormularioDeLocal({
  local,
  onTerminar,
  onCancelar,
}: {
  local?: Consignee
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}) {
  const clienteDeConsultas = useQueryClient()
  const editando = local !== undefined
  const [nombre, setNombre] = useState(local?.name ?? '')
  const [nit, setNit] = useState(local?.tax_id ?? '')
  const [telefono, setTelefono] = useState(local?.phone ?? '')
  const [notas, setNotas] = useState(local?.notes ?? '')
  const [activo, setActivo] = useState(local?.is_active ?? true)
  const guardar = useMutation({
    mutationFn: () => {
      const datos = { name: nombre, tax_id: nit, phone: telefono, notes: notas }
      return editando ? editarLocal(local.id, { ...datos, is_active: activo }) : crearLocal(datos)
    },
    onSuccess: async (guardado) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.consignacion })
      onTerminar(editando ? `Cambios de «${guardado.name}» guardados.` : `Local «${guardado.name}» creado.`)
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
      <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} errores={error?.campos.name} autoComplete="off" autoFocus required />
      <div className="campos-en-fila">
        <Campo etiqueta="NIT o cédula" value={nit} onChange={(e) => setNit(e.target.value)} errores={error?.campos.tax_id} autoComplete="off" />
        <Campo etiqueta="Teléfono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} errores={error?.campos.phone} autoComplete="off" />
      </div>
      <Campo etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} errores={error?.campos.notes} autoComplete="off" />
      {editando && (
        <Casilla etiqueta="Local activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} ayuda="Si lo desactivas no aparece al hacer entregas nuevas. Su historial se conserva." />
      )}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear local'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function LoQueTiene({ localId }: { localId: number }) {
  const pendientes = useQuery({
    queryKey: [...claves.consignacion, 'pendientes', localId],
    queryFn: ({ signal }) => pendientesDeLocal(localId, signal),
  })
  if (pendientes.isPending) return <Cargando />
  if (pendientes.isError) return <ErrorDeCarga error={pendientes.error} onReintentar={() => void pendientes.refetch()} />
  if (pendientes.data.length === 0) return <p className="texto-suave">El local no tiene mercancía pendiente.</p>
  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <caption className="solo-lectores">Mercancía que el local todavía tiene</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Entregado</th>
            <th scope="col" className="tabla__numero">
              Tiene
            </th>
            <th scope="col" className="tabla__numero">
              Valor pactado
            </th>
          </tr>
        </thead>
        <tbody>
          {pendientes.data.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {item.product.name}
                <span className="tabla__detalle tabla__codigo">{item.product.code}</span>
              </th>
              <td>{formatearFechaHora(item.delivered_at)}</td>
              <td className="tabla__numero">
                {item.pending_quantity} de {item.quantity}
              </td>
              <td className="tabla__numero">{formatearPesos(item.unit_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
