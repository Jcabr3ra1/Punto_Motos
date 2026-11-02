import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { listarProveedores } from '../../api/compras'
import { claves } from '../../api/consultas'
import type { Supplier } from '../../api/types'
import { Campo } from '../../components/Campo'
import { Casilla } from '../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { useDebounce } from '../../hooks/useDebounce'
import { formatearPesos } from '../../utilidades/dinero'
import { EstadoDeCuenta } from './EstadoDeCuenta'
import { FormularioDeAbono } from './FormularioDeAbono'
import { FormularioDeProveedor } from './FormularioDeProveedor'

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

  if (vista.tipo === 'crear' || vista.tipo === 'editar') {
    const proveedor = vista.tipo === 'editar' ? vista.proveedor : undefined
    return (
      <>
        <Titulo nivel={2}>{proveedor ? `Editar «${proveedor.name}»` : 'Nuevo proveedor'}</Titulo>
        <FormularioDeProveedor
          proveedor={proveedor}
          onTerminar={(mensaje) => ir({ tipo: 'lista' }, mensaje)}
          onCancelar={() => ir({ tipo: 'lista' })}
        />
      </>
    )
  }

  if (vista.tipo === 'abonar') {
    const volver = (mensaje: string | null = null) =>
      ir(vista.desde === 'cuenta' ? { tipo: 'cuenta', proveedor: vista.proveedor } : { tipo: 'lista' }, mensaje)
    return (
      <>
        <Titulo nivel={2}>Abonar a «{vista.proveedor.name}»</Titulo>
        <FormularioDeAbono proveedorId={vista.proveedor.id} onTerminar={volver} onCancelar={() => volver()} />
      </>
    )
  }

  if (vista.tipo === 'cuenta') {
    return (
      <>
        <div className="barra-de-acciones">
          <Titulo nivel={2}>Estado de cuenta de «{vista.proveedor.name}»</Titulo>
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
          proveedorId={vista.proveedor.id}
          onAbonar={() => ir({ tipo: 'abonar', proveedor: vista.proveedor, desde: 'cuenta' })}
        />
      </>
    )
  }

  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Proveedores</Titulo>
        <button type="button" className="boton boton--auto" onClick={() => ir({ tipo: 'crear' })}>
          Nuevo proveedor
        </button>
      </div>
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
          <p className="texto-suave">
            {busqueda || conDeuda ? 'Ningún proveedor coincide con los filtros.' : 'Todavía no hay proveedores.'}
          </p>
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
    </>
  )
}
