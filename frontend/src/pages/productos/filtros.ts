import type { OrdenDeProductos } from '../../api/productos'

export interface EstadoDeFiltros {
  busqueda: string
  tipo: string
  moto: string
  insumos: boolean
  desactivados: boolean
  orden: OrdenDeProductos
  pagina: number
}

export const FILTROS_INICIALES: EstadoDeFiltros = {
  busqueda: '',
  tipo: '',
  moto: '',
  insumos: false,
  desactivados: false,
  orden: 'name',
  pagina: 1,
}
