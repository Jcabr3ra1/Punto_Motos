import { useQuery } from '@tanstack/react-query'
import { listarProveedores } from '../../api/compras'
import { claves } from '../../api/consultas'

/**
 * Lo que se les debe a todos los proveedores y a cuántos, incluidos los desactivados (desactivar no borra la deuda). La
 * lista no está paginada: la suma es exacta.
 */
export function useDeudaConProveedores() {
  const proveedores = useQuery({
    queryKey: [...claves.proveedores, 'todos'],
    queryFn: ({ signal }) => listarProveedores({ include_inactive: true }, signal),
  })
  const lista = proveedores.data ?? []
  return {
    total: lista.reduce((suma, proveedor) => suma + proveedor.balance_due, 0),
    conSaldo: lista.filter((proveedor) => proveedor.balance_due > 0).length,
    cargando: proveedores.isPending,
    error: proveedores.isError,
  }
}
