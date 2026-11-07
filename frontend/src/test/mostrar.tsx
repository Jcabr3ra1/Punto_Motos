import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { crearClienteDeConsultas } from '../api/consultas'
import type { User } from '../api/types'
import { ContextoAuth, type ContextoAuth as TipoContextoAuth } from '../auth/contexto'
import { Rutas } from '../Rutas'

/** Monta las rutas de la aplicación con la sesión de `usuario` ya abierta, en la dirección indicada. */
export function mostrarRutas(usuario: User, ruta = '/', contenedor?: HTMLElement) {
  const cerrarSesion = vi.fn(async () => {})
  const contexto: TipoContextoAuth = {
    estado: { fase: 'con-sesion', usuario },
    sesionVencida: false,
    reintentar: () => {},
    iniciarSesion: async () => {},
    crearPrimerDueno: async () => {},
    cerrarSesion,
  }
  render(
    <QueryClientProvider client={crearClienteDeConsultas()}>
      <ContextoAuth.Provider value={contexto}>
        <MemoryRouter initialEntries={[ruta]}>
          <Rutas />
        </MemoryRouter>
      </ContextoAuth.Provider>
    </QueryClientProvider>,
    contenedor ? { container: contenedor } : undefined,
  )
  return { cerrarSesion }
}
