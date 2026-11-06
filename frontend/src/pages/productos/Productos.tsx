import { useState } from 'react'
import type { Product } from '../../api/types'
import { useUsuario } from '../../auth/useUsuario'
import { Plus } from 'lucide-react'
import { PanelLateral } from '../../components/PanelLateral'
import { Titulo } from '../../components/Titulo'
import { FormularioDeProducto } from './FormularioDeProducto'
import { FILTROS_INICIALES, type EstadoDeFiltros } from './filtros'
import { ListaDeProductos } from './ListaDeProductos'

type Vista = { tipo: 'lista' } | { tipo: 'crear' } | { tipo: 'editar'; producto: Product }

// Catálogo de productos. Todos consultan; solo el dueño crea y edita (incluido el precio).
export function Productos() {
  const esDueno = useUsuario().role === 'owner'
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' })
  const [aviso, setAviso] = useState<string | null>(null)
  // Los filtros viven aquí para que al volver del formulario la lista quede como estaba.
  const [filtros, setFiltros] = useState<EstadoDeFiltros>(FILTROS_INICIALES)

  function volver(mensaje?: string) {
    setAviso(mensaje ?? null)
    setVista({ tipo: 'lista' })
  }

  const producto = vista.tipo === 'editar' ? vista.producto : undefined

  return (
    <section>
      <div className="barra-de-acciones">
        <Titulo>Productos</Titulo>
        {esDueno && (
          <button
            type="button"
            className="boton boton--auto"
            onClick={() => {
              setAviso(null)
              setVista({ tipo: 'crear' })
            }}
          >
            <Plus aria-hidden="true" size={16} />
            Nuevo producto
          </button>
        )}
      </div>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <ListaDeProductos
        filtros={filtros}
        onCambiarFiltros={setFiltros}
        esDueno={esDueno}
        onAviso={setAviso}
        onEditar={(producto) => {
          setAviso(null)
          setVista({ tipo: 'editar', producto })
        }}
      />
      {vista.tipo !== 'lista' && (
        <PanelLateral
          titulo={producto ? `Editar ${producto.name}` : 'Nuevo producto'}
          modulo="Productos"
          descripcion={producto ? `Código ${producto.code}` : 'El código se sugiere a partir del nombre.'}
          ancho="ancho"
          onCerrar={() => volver()}
        >
          <FormularioDeProducto producto={producto} onTerminar={volver} onCancelar={() => volver()} />
        </PanelLateral>
      )}
    </section>
  )
}
