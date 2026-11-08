import { Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listarProveedores } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { Supplier } from '../../api/types'
import { Campo } from '../../components/Campo'
import { Casilla } from '../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { PanelLateral } from '../../components/PanelLateral'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Titulo } from '../../components/Titulo'
import { useAtajo } from '../../hooks/useAtajo'
import { DESTINOS } from '../../navegacion/destinos'
import { useDebounce } from '../../hooks/useDebounce'
import { formatearPesos } from '../../utilidades/dinero'
import { useDeudaConProveedores } from './useDeudaConProveedores'
import { EstadoDeCuenta } from './EstadoDeCuenta'
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
  // Ctrl+N solo en la lista: en el estado de cuenta no hay «Nuevo proveedor».
  useAtajo('n', () => ir({ tipo: 'crear' }), fondo.tipo !== 'cuenta')

  if (fondo.tipo === 'cuenta') {
    return (
      <>
        <div className="barra-de-acciones">
          <Titulo nivel={2}>Estado de cuenta de «{fondo.proveedor.name}»</Titulo>
          <button type="button" className="boton boton--secundario boton--auto" onClick={() => ir({ tipo: 'lista' })}>
            Volver a proveedores
          </button>
        </div>
        {aviso && (
          <p role="status" className="aviso aviso--exito">
            {aviso}
          </p>
        )}
        <EstadoDeCuenta
          proveedorId={fondo.proveedor.id}
          onAbonar={() => ir({ tipo: 'abonar', proveedor: fondo.proveedor, desde: 'cuenta' })}
        />
        {panel}
      </>
    )
  }

  return (
    <>
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
      <div className="filtros" role="search" aria-label="Filtrar proveedores">
        <Campo
          etiqueta="Buscar"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o NIT"
          autoComplete="off"
        />
      </div>
      <div className="filtros__casillas">
        <Casilla etiqueta="Solo a los que se les debe" checked={conDeuda} onChange={(e) => setConDeuda(e.target.checked)} />
        <Casilla etiqueta="Mostrar desactivados" checked={desactivados} onChange={(e) => setDesactivados(e.target.checked)} />
      </div>

      {proveedores.isPending && <Cargando />}
      {proveedores.isError && <ErrorDeCarga error={proveedores.error} onReintentar={() => void proveedores.refetch()} />}
      {proveedores.isSuccess &&
        (proveedores.data.length === 0 ? (
          <EstadoVacio
            icono={DESTINOS.proveedores.icono}
            mensaje={busqueda || conDeuda ? 'Ningún proveedor coincide con los filtros.' : 'Todavía no hay proveedores.'}
          />
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <caption className="solo-lectores">Proveedores</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">NIT o cédula</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col" className="tabla__numero">
                    Se le debe
                  </th>
                  <th scope="col">
                    <span className="solo-lectores">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {proveedores.data.map((proveedor) => (
                  <tr key={proveedor.id} className={proveedor.is_active ? undefined : 'tabla__fila--inactiva'}>
                    <th scope="row">
                      {proveedor.name}
                      {!proveedor.is_active && <span className="tabla__detalle">Desactivado</span>}
                    </th>
                    <td>{proveedor.tax_id || '—'}</td>
                    <td>{proveedor.phone || '—'}</td>
                    <td className="tabla__numero">
                      {proveedor.balance_due > 0 ? <strong>{formatearPesos(proveedor.balance_due)}</strong> : formatearPesos(0)}
                    </td>
                    <td className="tabla__acciones">
                      <button
                        type="button"
                        className="boton-enlace"
                        aria-label={`Estado de cuenta de ${proveedor.name}`}
                        onClick={() => ir({ tipo: 'cuenta', proveedor })}
                      >
                        Estado de cuenta
                      </button>
                      {proveedor.balance_due > 0 && (
                        <button
                          type="button"
                          className="boton-enlace"
                          aria-label={`Abonar a ${proveedor.name}`}
                          onClick={() => ir({ tipo: 'abonar', proveedor, desde: 'lista' })}
                        >
                          Abonar
                        </button>
                      )}
                      <button
                        type="button"
                        className="boton-enlace"
                        aria-label={`Editar ${proveedor.name}`}
                        onClick={() => ir({ tipo: 'editar', proveedor })}
                      >
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
