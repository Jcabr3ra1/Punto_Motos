import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { useProductosPorReponer } from '../../hooks/useProductosPorReponer'
import { DESTINOS } from '../../navegacion/destinos'
import { NoSePudoCargar } from './comun'

/** Cuántos se ven en el panel; el resto se cuenta en «y N más». */
const A_LA_VISTA = 6

/** «Se están acabando»: los productos en su mínimo o por debajo, del agotado al que apenas llegó al mínimo. */
export function PorReponer() {
  const idTitulo = useId()
  const consulta = useProductosPorReponer()
  const productos = consulta.data ?? []
  const restantes = productos.length - A_LA_VISTA

  return (
    <section className="panel-inicio" aria-labelledby={idTitulo}>
      <div className="panel-inicio__cabecera">
        <h2 id={idTitulo} className="panel-inicio__titulo">
          Se están acabando
        </h2>
        {consulta.isSuccess && productos.length > 0 && <span className="por-reponer__cuenta">{productos.length} por reponer</span>}
      </div>
      {consulta.isPending ? (
        <p className="panel-inicio__vacio" aria-busy="true">
          Revisando las existencias…
        </p>
      ) : consulta.isError ? (
        <div className="panel-inicio__cuerpo">
          <NoSePudoCargar />
        </div>
      ) : productos.length === 0 ? (
        <p className="panel-inicio__vacio">Ningún producto está en su mínimo.</p>
      ) : (
        <>
          <ul className="por-reponer">
            {productos.slice(0, A_LA_VISTA).map((producto) => (
              <li key={producto.id} className="por-reponer__fila">
                <span className="por-reponer__nombre" title={producto.name}>
                  <span className="tabla__codigo">{producto.code}</span>
                  <span className="por-reponer__texto">{producto.name}</span>
                </span>
                <span className={producto.stock <= 0 ? 'por-reponer__cifra por-reponer__cifra--agotado' : 'por-reponer__cifra'}>
                  {producto.stock <= 0 ? 'Agotado' : `${producto.stock} / ${producto.min_stock}`}
                </span>
              </li>
            ))}
          </ul>
          <div className="por-reponer__pie">
            <span>{restantes > 0 ? `y ${restantes} más` : ''}</span>
            <Link to={DESTINOS.productos.ruta} className="panel-inicio__enlace">
              Ver productos
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
