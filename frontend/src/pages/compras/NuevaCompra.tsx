import { Titulo } from '../../components/Titulo'
import { FormularioDeCompra } from './FormularioDeCompra'

export function NuevaCompra() {
  return (
    <>
      <Titulo nivel={2}>Nueva compra</Titulo>
      <p className="texto-suave">
        Se guarda como borrador: no toca el inventario hasta que la recibas.
      </p>
      <FormularioDeCompra />
    </>
  )
}
