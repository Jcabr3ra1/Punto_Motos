import { QueryClient } from '@tanstack/react-query'

/** Claves de la caché de consultas. Se invalidan tras guardar para volver a pedir lo que cambió. */
export const claves = {
  negocio: ['negocio'] as const,
  usuarios: ['usuarios'] as const,
  /** Listas que alimentan los desplegables: solo lo activo. */
  catalogoActivo: (tipo: string) => ['catalogo', tipo, 'activo'] as const,
  /** Pantalla de administración: incluye lo desactivado. */
  catalogoCompleto: (tipo: string) => ['catalogo', tipo, 'completo'] as const,
  /** Todo el catálogo (activo y completo): se invalida junto tras un cambio. */
  catalogo: ['catalogo'] as const,
  productos: ['productos'] as const,
  conteoInicial: ['inventario', 'conteo-inicial'] as const,
  movimientos: ['inventario', 'movimientos'] as const,
  producto: (id: number) => ['producto', id] as const,
  proveedores: ['proveedores'] as const,
  compras: ['compras'] as const,
  abonos: ['abonos'] as const,
  ventas: ['ventas'] as const,
  clientes: ['clientes'] as const,
  caja: ['caja'] as const,
  cajaActual: ['caja', 'actual'] as const,
  consignacion: ['consignacion'] as const,
  buscador: (texto: string) => ['buscador', texto] as const,
}

export function crearClienteDeConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Los errores de la API (400, 403, 404) no mejoran al repetir la llamada.
        retry: false,
        // Evita recargar mientras la persona está escribiendo en un formulario.
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
