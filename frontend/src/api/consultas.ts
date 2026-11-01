import { QueryClient } from '@tanstack/react-query'

/** Claves de la caché de consultas. Se invalidan tras guardar para volver a pedir lo que cambió. */
export const claves = {
  negocio: ['negocio'] as const,
  usuarios: ['usuarios'] as const,
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
