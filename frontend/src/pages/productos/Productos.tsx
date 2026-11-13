import { useState } from 'react'
import type { Product } from '../../api/types'
import { useUsuario } from '../../auth/useUsuario'
import { Plus } from 'lucide-react'
import { claves } from '../../api/consultas'
import { listarProductos } from '../../api/productos'
import { BotonExportarExcel } from '../../components/BotonExportarExcel'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { PanelLateral } from '../../components/PanelLateral'
import { useAtajo } from '../../hooks/useAtajo'
import { useConteo } from '../../hooks/useConteo'
import { DESTINOS } from '../../navegacion/destinos'
import { exportarExcel, todasLasPaginas } from '../../utilidades/excel'
import { formatearNumero } from '../../utilidades/numeros'
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

  function crear() {
    setAviso(null)
    setVista({ tipo: 'crear' })
  }
  useAtajo('n', crear, esDueno)

  // Cifras exactas: el total de cada consulta, no la suma de una página.
  const activos = useConteo([...claves.productos, 'activos'], (signal) => listarProductos({ page_size: 1 }, signal))
  const insumos = useConteo([...claves.productos, 'insumos'], (signal) =>
    listarProductos({ workshop_supply: true, page_size: 1 }, signal),
  )

  async function exportarProductos() {
    const lista = await todasLasPaginas((page, page_size) =>
      listarProductos({
        q: filtros.busqueda || undefined,
        category: filtros.tipo ? Number(filtros.tipo) : undefined,
        moto: filtros.moto ? Number(filtros.moto) : undefined,
        workshop_supply: filtros.insumos,
        include_inactive: filtros.desactivados,
        ordering: filtros.orden,
        page,
        page_size,
      }),
    )
    const encabezados = esDueno
      ? ['Código', 'Producto', 'Tipo', 'Marca', 'Moto', 'Costo (COP)', 'Precio venta (COP)', 'Existencias', 'Ubicación', 'Activo']
      : ['Código', 'Producto', 'Tipo', 'Marca', 'Moto', 'Precio venta (COP)', 'Existencias', 'Ubicación', 'Activo']
    await exportarExcel('productos-inventario', [
      {
        nombre: 'Productos',
        encabezados,
        filas: lista.map((p) => {
          const moto = p.is_universal ? 'Universal' : (p.moto?.name ?? '')
          return esDueno
            ? [p.code, p.name, p.category.name, p.brand?.name ?? '', moto, p.cost_price ?? 0, p.sale_price, p.stock, p.location, p.is_active]
            : [p.code, p.name, p.category.name, p.brand?.name ?? '', moto, p.sale_price, p.stock, p.location, p.is_active]
        }),
      },
    ])
  }

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.productos.icono}
        titulo="Productos"
        descripcion="Existencias, precios y códigos. Elige un producto para ver su ficha."
        acciones={
          <div className="acciones">
            <BotonExportarExcel onExportar={exportarProductos} />
            {esDueno && (
              <button type="button" className="boton boton--auto boton--con-icono" onClick={crear} aria-keyshortcuts="Control+N">
                <Plus aria-hidden="true" size={16} />
                Nuevo producto
                <kbd className="atajo-visible" aria-hidden="true">Ctrl+N</kbd>
              </button>
            )}
          </div>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Productos activos', valor: formatearNumero(activos.data ?? 0), cargando: activos.isPending, error: activos.isError },
          { rotulo: 'Insumos de taller', valor: formatearNumero(insumos.data ?? 0), cargando: insumos.isPending, error: insumos.isError },
        ]}
      />
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
