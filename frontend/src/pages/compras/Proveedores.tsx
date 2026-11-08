import { FileText, HandCoins, Pencil, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { listarProveedores } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { Supplier } from '../../api/types'
import { BarraDeFiltros, BotonDeFiltro } from '../../components/BarraDeFiltros'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { PanelLateral } from '../../components/PanelLateral'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Paginacion } from '../../components/Paginacion'
import { RegistroVacio } from '../../components/Registro'
import { VentanaDeDocumento } from '../../components/VentanaDeDocumento'
import { useAtajo } from '../../hooks/useAtajo'
import { DESTINOS } from '../../navegacion/destinos'
import { useDebounce } from '../../hooks/useDebounce'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useSeleccion } from '../../hooks/useSeleccion'
import { formatearPesos } from '../../utilidades/dinero'
import { useDeudaConProveedores } from './useDeudaConProveedores'
import { EstadoDeCuenta } from './EstadoDeCuenta'
import { FichaDeProveedor } from './FichaDeProveedor'
import { FormularioDeAbono } from './FormularioDeAbono'
import { FormularioDeProveedor } from './FormularioDeProveedor'
import { EstadoVacio } from '../../components/EstadoVacio'

type Vista =
  | { tipo: 'lista' }
  | { tipo: 'crear' }
  | { tipo: 'editar'; proveedor: Supplier }
  | { tipo: 'cuenta'; proveedor: Supplier }
  | { tipo: 'abonar'; proveedor: Supplier; desde: 'lista' | 'cuenta' }

// Proveedores (solo el dueño): lo que se les debe, alta, edición y desactivación. No se borran.
export function Proveedores() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [conDeuda, setConDeuda] = useState(false)
  const [desactivados, setDesactivados] = useState(false)

  const filtros = { q: useDebounce(busqueda), with_debt: conDeuda, include_inactive: desactivados }
  const proveedores = useQuery({
    queryKey: [...claves.proveedores, filtros],
    queryFn: ({ signal }) => listarProveedores(filtros, signal),
  })

  function ir(siguiente: Vista, mensaje: string | null = null) {
    setAviso(mensaje)
    setVista(siguiente)
  }

  // Los formularios se abren en un panel sobre la pantalla en la que se estaba (la lista o el estado de cuenta).
  const panel =
    vista.tipo === 'crear' || vista.tipo === 'editar' ? (
      <PanelLateral
        titulo={vista.tipo === 'editar' ? `Editar «${vista.proveedor.name}»` : 'Nuevo proveedor'}
        modulo="Compras"
        descripcion="Datos para pedirle mercancía y llevar lo que se le debe."
        onCerrar={() => ir({ tipo: 'lista' })}
      >
        <FormularioDeProveedor
          proveedor={vista.tipo === 'editar' ? vista.proveedor : undefined}
          onTerminar={(mensaje) => ir({ tipo: 'lista' }, mensaje)}
          onCancelar={() => ir({ tipo: 'lista' })}
        />
      </PanelLateral>
    ) : vista.tipo === 'abonar' ? (
      <PanelAbono vista={vista} onVolver={(siguiente, mensaje) => ir(siguiente, mensaje)} />
    ) : null
  const fondo: Vista = vista.tipo === 'abonar' && vista.desde === 'cuenta' ? { tipo: 'cuenta', proveedor: vista.proveedor } : vista

  const deuda = useDeudaConProveedores()
  useAtajo('n', () => ir({ tipo: 'crear' }))

  // La API entrega la lista completa (ya filtrada): las páginas de las filas que caben se arman aquí.
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const [pagina, setPagina] = useState(1)
  const todos = proveedores.data ?? []
  const paginas = Math.max(1, Math.ceil(todos.length / porPagina))
  const actual = Math.min(pagina, paginas)
  const enPagina = todos.slice((actual - 1) * porPagina, actual * porPagina)
  const seleccion = useSeleccion(enPagina, (proveedor) => proveedor.id)

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.proveedores.icono}
        titulo="Proveedores"
        descripcion="Datos de contacto y lo que se le debe a cada uno."
        acciones={
          <button
            type="button"
            className="boton boton--auto boton--con-icono"
            onClick={() => ir({ tipo: 'crear' })}
            aria-keyshortcuts="Control+N"
          >
            <Plus aria-hidden="true" size={16} />
            Nuevo proveedor
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+N
            </kbd>
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Debo en total', valor: formatearPesos(deuda.total), cargando: deuda.cargando, error: deuda.error, alerta: deuda.total > 0 },
          { rotulo: 'Proveedores con saldo', valor: String(deuda.conSaldo), cargando: deuda.cargando, error: deuda.error },
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
        {proveedores.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {todos.length === 1 ? '1 proveedor' : `${todos.length} proveedores`}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de proveedores">
          {proveedores.isPending && <Cargando />}
          {proveedores.isError && <ErrorDeCarga error={proveedores.error} onReintentar={() => void proveedores.refetch()} />}
          {proveedores.isSuccess &&
            (todos.length === 0 ? (
              <EstadoVacio
                icono={DESTINOS.proveedores.icono}
                mensaje={busqueda || conDeuda ? 'Ningún proveedor coincide con los filtros.' : 'Todavía no hay proveedores.'}
              />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-proveedores">
                <p id="ayuda-proveedores" className="solo-lectores">
                  Usa las flechas para ver la cuenta de cada proveedor.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Proveedores</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col" className="libro__secundaria">
                        NIT o cédula
                      </th>
                      <th scope="col">Teléfono</th>
                      <th scope="col" className="tabla__numero">
                        Se le debe
                      </th>
                      <th scope="col" className="tabla__acciones">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {enPagina.map((proveedor) => (
                      <tr
                        key={proveedor.id}
                        className={`tabla__fila--elegible${proveedor.is_active ? '' : ' tabla__fila--inactiva'}`}
                        aria-selected={seleccion.elegido?.id === proveedor.id}
                        onClick={seleccion.alHacerClic(proveedor)}
                      >
                        <th scope="row">
                          {proveedor.name}
                          {!proveedor.is_active && <span className="tabla__detalle">Desactivado</span>}
                        </th>
                        <td className="libro__secundaria">{proveedor.tax_id || '—'}</td>
                        <td>{proveedor.phone || '—'}</td>
                        <td className="tabla__numero">
                          {proveedor.balance_due > 0 ? <strong>{formatearPesos(proveedor.balance_due)}</strong> : '—'}
                        </td>
                        <td className="tabla__acciones">
                          <button
                            type="button"
                            className="boton-icono"
                            aria-label={`Estado de cuenta de ${proveedor.name}`}
                            title="Estado de cuenta"
                            onClick={() => ir({ tipo: 'cuenta', proveedor })}
                          >
                            <FileText aria-hidden="true" size={16} strokeWidth={1.75} />
                          </button>
                          {proveedor.balance_due > 0 && (
                            <button
                              type="button"
                              className="boton-icono"
                              aria-label={`Abonar a ${proveedor.name}`}
                              title="Abonar"
                              onClick={() => ir({ tipo: 'abonar', proveedor, desde: 'lista' })}
                            >
                              <HandCoins aria-hidden="true" size={16} strokeWidth={1.75} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="boton-icono"
                            aria-label={`Editar ${proveedor.name}`}
                            title="Editar"
                            onClick={() => ir({ tipo: 'editar', proveedor })}
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
          {proveedores.isSuccess && (
            <Paginacion
              etiqueta="Páginas de proveedores"
              pagina={actual}
              total={todos.length}
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
          <FichaDeProveedor
            proveedor={seleccion.elegido}
            onAbonar={() => seleccion.elegido && ir({ tipo: 'abonar', proveedor: seleccion.elegido, desde: 'lista' })}
            onEstadoDeCuenta={() => seleccion.elegido && ir({ tipo: 'cuenta', proveedor: seleccion.elegido })}
            onCerrar={seleccion.cerrar}
          />
        ) : (
          <RegistroVacio mensaje="Elige un proveedor para ver su cuenta." />
        )}
      </div>
      {/* El estado de cuenta en una ventana emergente sobre la lista; desde ahí se puede abonar. */}
      {fondo.tipo === 'cuenta' && (
        <VentanaDeDocumento titulo={`Estado de cuenta de «${fondo.proveedor.name}»`} onCerrar={() => ir({ tipo: 'lista' })}>
          <EstadoDeCuenta proveedorId={fondo.proveedor.id} onAbonar={() => ir({ tipo: 'abonar', proveedor: fondo.proveedor, desde: 'cuenta' })} />
        </VentanaDeDocumento>
      )}
      {panel}
    </section>
  )
}

/** El abono va en su propio panel: al terminar vuelve a donde se abrió (la lista o el estado de cuenta). */
function PanelAbono({
  vista,
  onVolver,
}: {
  vista: Extract<Vista, { tipo: 'abonar' }>
  onVolver: (siguiente: Vista, mensaje?: string | null) => void
}) {
  const volver = (mensaje: string | null = null) =>
    onVolver(vista.desde === 'cuenta' ? { tipo: 'cuenta', proveedor: vista.proveedor } : { tipo: 'lista' }, mensaje)
  return (
    <PanelLateral
      titulo={`Abonar a «${vista.proveedor.name}»`}
      modulo="Compras"
      descripcion="El abono se reparte entre las compras más antiguas, salvo que elijas una."
      onCerrar={() => volver()}
    >
      <FormularioDeAbono proveedorId={vista.proveedor.id} onTerminar={volver} onCancelar={() => volver()} />
    </PanelLateral>
  )
}
