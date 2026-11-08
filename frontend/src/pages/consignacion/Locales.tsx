import { HandCoins, Pencil, Plus } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { crearLocal, editarLocal, listarLocales, pendientesDeLocal } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { Consignee } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BarraDeFiltros, BotonDeFiltro } from '../../components/BarraDeFiltros'
import { Campo } from '../../components/Campo'
import { Casilla } from '../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Paginacion } from '../../components/Paginacion'
import { PanelLateral } from '../../components/PanelLateral'
import { Registro, RegistroVacio } from '../../components/Registro'
import { useAtajo } from '../../hooks/useAtajo'
import { useDebounce } from '../../hooks/useDebounce'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia } from '../../utilidades/fechas'
import { FormularioDePago } from './PagosDeLocales'

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; local: Consignee } | { tipo: 'pagar'; local: Consignee }

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
  useAtajo('n', () => ir({ tipo: 'crear' }))

  const local = vista.tipo === 'editar' ? vista.local : undefined
  const panel =
    vista.tipo === 'crear' || vista.tipo === 'editar' ? (
      <PanelLateral
        titulo={local ? `Editar «${local.name}»` : 'Nuevo local'}
        modulo="Consignación"
        descripcion="Otro local que recibe mercancía para vender y la paga después."
        onCerrar={() => ir({ tipo: 'lista' })}
      >
        <FormularioDeLocal local={local} onTerminar={(m) => ir({ tipo: 'lista' }, m)} onCancelar={() => ir({ tipo: 'lista' })} />
      </PanelLateral>
    ) : vista.tipo === 'pagar' ? (
      <PanelLateral
        titulo={`Pago de «${vista.local.name}»`}
        modulo="Consignación"
        descripcion="Lo que el local paga por la mercancía que vendió."
        onCerrar={() => ir({ tipo: 'lista' })}
      >
        <FormularioDePago localInicial={vista.local.id} onTerminar={(m) => ir({ tipo: 'lista' }, m)} onCancelar={() => ir({ tipo: 'lista' })} />
      </PanelLateral>
    ) : null

  // Sin el filtro de búsqueda y con los desactivados (desactivar no borra la deuda): la suma es exacta.
  const todos = useQuery({ queryKey: [...claves.consignacion, 'locales', 'todos'], queryFn: ({ signal }) => listarLocales({ include_inactive: true }, signal) })
  const deuda = {
    total: (todos.data ?? []).reduce((suma, uno) => suma + uno.balance_due, 0),
    conSaldo: (todos.data ?? []).filter((uno) => uno.balance_due > 0).length,
    cargando: todos.isPending,
    error: todos.isError,
  }

  // La API entrega la lista completa (ya filtrada): las páginas de las filas que caben se arman aquí.
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const [pagina, setPagina] = useState(1)
  const visibles = locales.data ?? []
  const paginas = Math.max(1, Math.ceil(visibles.length / porPagina))
  const actual = Math.min(pagina, paginas)
  const enPagina = visibles.slice((actual - 1) * porPagina, actual * porPagina)
  const seleccion = useSeleccion(enPagina, (uno) => uno.id)

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.locales.icono}
        titulo="Locales"
        descripcion="Locales que venden mercancía en consignación y lo que deben."
        acciones={
          <button
            type="button"
            className="boton boton--auto boton--con-icono"
            onClick={() => ir({ tipo: 'crear' })}
            aria-keyshortcuts="Control+N"
          >
            <Plus aria-hidden="true" size={16} />
            Nuevo local
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+N
            </kbd>
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Me deben en total', valor: formatearPesos(deuda.total), cargando: deuda.cargando, error: deuda.error },
          { rotulo: 'Locales con saldo', valor: String(deuda.conSaldo), cargando: deuda.cargando, error: deuda.error },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <BarraDeFiltros
        busqueda={{
          etiqueta: 'Buscar',
          placeholder: 'Nombre o NIT',
          valor: busqueda,
          onCambiar: (valor) => {
            setBusqueda(valor)
            setPagina(1)
          },
        }}
      >
        <div className="barra-de-filtros__grupo">
          <BotonDeFiltro
            activo={conDeuda}
            onClick={() => {
              setConDeuda(!conDeuda)
              setPagina(1)
            }}
          >
            Con saldo
          </BotonDeFiltro>
          <BotonDeFiltro
            activo={desactivados}
            onClick={() => {
              setDesactivados(!desactivados)
              setPagina(1)
            }}
          >
            Desactivados
          </BotonDeFiltro>
        </div>
        {locales.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {visibles.length === 1 ? '1 local' : `${visibles.length} locales`}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de locales">
          {locales.isPending && <Cargando />}
          {locales.isError && <ErrorDeCarga error={locales.error} onReintentar={() => void locales.refetch()} />}
          {locales.isSuccess &&
            (visibles.length === 0 ? (
              <EstadoVacio
                icono={DESTINOS.locales.icono}
                mensaje={busqueda || conDeuda ? 'Ningún local coincide con los filtros.' : 'Todavía no hay locales.'}
              />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-locales">
                <p id="ayuda-locales" className="solo-lectores">
                  Usa las flechas para ver la cuenta de cada local.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Locales en consignación</caption>
                  <thead>
                    <tr>
                      <th scope="col">Local</th>
                      <th scope="col" className="libro__secundaria">
                        NIT o cédula
                      </th>
                      <th scope="col">Teléfono</th>
                      <th scope="col" className="tabla__numero">
                        Debe
                      </th>
                      <th scope="col" className="tabla__acciones">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enPagina.map((uno) => (
                      <tr
                        key={uno.id}
                        className={`tabla__fila--elegible${uno.is_active ? '' : ' tabla__fila--inactiva'}`}
                        aria-selected={seleccion.elegido?.id === uno.id}
                        onClick={seleccion.alHacerClic(uno)}
                      >
                        <th scope="row">
                          {uno.name}
                          {!uno.is_active && <span className="tabla__detalle">Desactivado</span>}
                        </th>
                        <td className="libro__secundaria">{uno.tax_id || '—'}</td>
                        <td>{uno.phone || '—'}</td>
                        <td className="tabla__numero">{uno.balance_due > 0 ? <strong>{formatearPesos(uno.balance_due)}</strong> : '—'}</td>
                        <td className="tabla__acciones">
                          {uno.balance_due > 0 && (
                            <button
                              type="button"
                              className="boton-icono"
                              aria-label={`Registrar pago de ${uno.name}`}
                              title="Registrar pago"
                              onClick={() => ir({ tipo: 'pagar', local: uno })}
                            >
                              <HandCoins aria-hidden="true" size={16} strokeWidth={1.75} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="boton-icono"
                            aria-label={`Editar ${uno.name}`}
                            title="Editar"
                            onClick={() => ir({ tipo: 'editar', local: uno })}
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
          {locales.isSuccess && (
            <Paginacion
              etiqueta="Páginas de locales"
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
        {seleccion.elegido ? (
          <FichaDeLocal
            local={seleccion.elegido}
            onPagar={() => seleccion.elegido && ir({ tipo: 'pagar', local: seleccion.elegido })}
            onEditar={() => seleccion.elegido && ir({ tipo: 'editar', local: seleccion.elegido })}
            onCerrar={seleccion.cerrar}
          />
        ) : (
          <RegistroVacio mensaje="Elige un local para ver lo que debe y lo que tiene." />
        )}
      </div>
      {panel}
    </section>
  )
}

/** El local elegido en el registro negro: lo que debe, sus datos y la mercancía que todavía tiene. */
function FichaDeLocal({ local, onPagar, onEditar, onCerrar }: { local: Consignee; onPagar: () => void; onEditar: () => void; onCerrar: () => void }) {
  const pendientes = useQuery({
    queryKey: [...claves.consignacion, 'pendientes', local.id],
    queryFn: ({ signal }) => pendientesDeLocal(local.id, signal),
  })
  const debe = local.balance_due > 0
  return (
    <Registro
      titulo={local.name}
      modulo="Locales"
      onCerrar={onCerrar}
      acciones={
        <>
          {debe && (
            <button type="button" className="boton" onClick={onPagar}>
              Registrar pago
            </button>
          )}
          <button type="button" className="boton boton--secundario" onClick={onEditar}>
            Editar
          </button>
        </>
      }
    >
      <p className="registro__cifra">
        <span className="registro__total">{formatearPesos(local.balance_due)}</span>
        <span className="registro__detalle">{debe ? 'debe por lo vendido' : 'no debe nada'}</span>
      </p>
      <dl className="registro__datos">
        <div>
          <dt>NIT o cédula</dt>
          <dd>{local.tax_id || '—'}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{local.phone || '—'}</dd>
        </div>
        {local.notes && (
          <div>
            <dt>Notas</dt>
            <dd>{local.notes}</dd>
          </div>
        )}
        {!local.is_active && (
          <div>
            <dt>Estado</dt>
            <dd>Desactivado</dd>
          </div>
        )}
      </dl>
      <h4 className="registro__subtitulo">Lo que tiene</h4>
      {pendientes.isPending && <p className="registro__nota">Cargando…</p>}
      {pendientes.isError && <p className="registro__nota">No se pudo cargar la mercancía del local.</p>}
      {pendientes.data &&
        (pendientes.data.length === 0 ? (
          <p className="registro__nota">No tiene mercancía pendiente.</p>
        ) : (
          <ul className="registro__lineas" aria-label={`Mercancía que tiene ${local.name}`}>
            {pendientes.data.map((item) => (
              <li key={item.id}>
                <span>
                  {item.product.name}
                  <span className="registro__detalle">
                    Entregado el {formatearDia(item.delivered_at.slice(0, 10))} · {formatearPesos(item.unit_value)} por unidad
                  </span>
                </span>
                <span className="registro__monto">
                  {item.pending_quantity} de {item.quantity}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </Registro>
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
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
