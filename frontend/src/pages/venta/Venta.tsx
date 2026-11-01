import { BuscadorDeProductos } from '../../components/BuscadorDeProductos'
import { Titulo } from '../../components/Titulo'
import { useConteoInicial } from '../inventario/useConteoInicial'

// Pantalla de venta. El backend todavía no tiene el módulo de ventas, así que por ahora solo
// consulta precios y existencias con el buscador. Cuando exista el contrato de ventas, el buscador
// recibe `onElegir` para agregar productos a la venta.
export function Venta() {
  const conteo = useConteoInicial()

  return (
    <section>
      <Titulo>Venta</Titulo>
      {conteo.data?.is_open && (
        <p role="status" className="aviso aviso--advertencia">
          El inventario inicial todavía no ha terminado: no se debe vender hasta que el dueño lo termine.
        </p>
      )}
      <p className="texto-suave">Por ahora puedes consultar precios y existencias. Registrar ventas estará disponible más adelante.</p>
      <BuscadorDeProductos />
    </section>
  )
}
