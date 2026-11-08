import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { claves } from '../../api/consultas'
import { buscarProductos } from '../../api/productos'
import { useCajaActual } from '../../hooks/useCajaActual'
import { useDebounce } from '../../hooks/useDebounce'
import { formatearPesos } from '../../utilidades/dinero'
import { EncabezadoDeInicio } from './comun'
import { TablaDeVentas } from './TablaDeVentas'

/** Atender rápido: nueva venta, consultar precio y existencia, y las ventas de hoy. */
export function InicioDelVendedor() {
  const caja = useCajaActual()
  const subtitulo =
    caja.data === undefined
      ? 'listo para atender'
      : caja.data.is_open
        ? 'la caja está abierta, puedes vender'
        : 'la caja está cerrada: pídele al dueño que la abra'
  return (
    <div className="inicio">
      <EncabezadoDeInicio subtitulo={subtitulo} />
      <div className="inicio__vendedor">
        <ConsultaDePrecios />
        <TablaDeVentas titulo="Ventas de hoy" cuantas={8} completa={false} />
      </div>
    </div>
  )
}

/** Precio y unidades de un producto sin entrar a Productos. Solo consulta: no tiene acciones. */
function ConsultaDePrecios() {
  const [texto, setTexto] = useState('')
  const buscado = useDebounce(texto.trim())
  const resultados = useQuery({
    queryKey: claves.buscador(buscado),
    queryFn: ({ signal }) => buscarProductos(buscado, signal),
    enabled: buscado.length >= 2,
  })
  return (
    <section className="consulta" aria-labelledby="titulo-consulta">
      <label id="titulo-consulta" htmlFor="campo-consulta" className="consulta__rotulo">
        Consultar precio y existencia
      </label>
      <div className="consulta__campo">
        <Search aria-hidden="true" size={18} strokeWidth={1.75} />
        <input
          id="campo-consulta"
          type="search"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Código, nombre o moto"
          autoComplete="off"
        />
      </div>
      {buscado.length >= 2 && resultados.isSuccess && (
        resultados.data.length === 0 ? (
          <p className="consulta__vacio">No hay productos con «{buscado}».</p>
        ) : (
          <ul className="consulta__resultados" aria-label="Resultados de la consulta">
            {resultados.data.map((producto) => (
              <li key={producto.id} className="consulta__resultado">
                <span className="consulta__producto">
                  <span className="consulta__nombre">{producto.name}</span>
                  <span className="consulta__detalle">
                    {[producto.moto?.name ?? 'Universal', producto.brand?.name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="consulta__precio">{formatearPesos(producto.sale_price)}</span>
                <span className={`consulta__existencia${producto.is_low_stock ? ' consulta__existencia--baja' : ''}`}>
                  {producto.stock} und.
                </span>
              </li>
            ))}
          </ul>
        )
      )}
      {resultados.isError && <p className="consulta__vacio">No se pudo consultar. Intenta de nuevo.</p>}
    </section>
  )
}
