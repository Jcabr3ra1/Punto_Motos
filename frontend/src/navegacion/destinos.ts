import type { Role } from '../api/types'

// Única fuente de verdad de qué pantallas existen y quién puede verlas.
// El menú y las rutas protegidas salen de aquí. Aunque se oculte una pantalla,
// el backend sigue rechazando con 403 lo que el rol no permite (docs/backend/API.md#roles-y-permisos).

export interface Destino {
  ruta: string
  etiqueta: string
  roles: readonly Role[]
  /** Solo se muestra en el menú mientras el inventario inicial siga abierto. */
  soloConConteoAbierto?: boolean
}

const TODOS: readonly Role[] = ['owner', 'seller']
const SOLO_DUENO: readonly Role[] = ['owner']

export const DESTINOS = {
  inicio: { ruta: '/', etiqueta: 'Inicio', roles: TODOS },
  venta: { ruta: '/venta', etiqueta: 'Venta', roles: TODOS },
  productos: { ruta: '/productos', etiqueta: 'Productos', roles: TODOS },
  movimientos: { ruta: '/inventario/movimientos', etiqueta: 'Movimientos', roles: TODOS },
  inventarioInicial: {
    ruta: '/inventario-inicial',
    etiqueta: 'Inventario inicial',
    roles: SOLO_DUENO,
    soloConConteoAbierto: true,
  },
  configuracion: { ruta: '/configuracion', etiqueta: 'Configuración', roles: TODOS },
  negocio: { ruta: '/configuracion/negocio', etiqueta: 'Datos del negocio', roles: TODOS },
  catalogo: { ruta: '/configuracion/catalogo', etiqueta: 'Tipos, marcas y motos', roles: SOLO_DUENO },
  usuarios: { ruta: '/configuracion/usuarios', etiqueta: 'Usuarios', roles: SOLO_DUENO },
} as const satisfies Record<string, Destino>

export const MENU_PRINCIPAL: readonly Destino[] = [
  DESTINOS.inicio,
  DESTINOS.venta,
  DESTINOS.productos,
  DESTINOS.movimientos,
  DESTINOS.inventarioInicial,
  DESTINOS.configuracion,
]

export const MENU_CONFIGURACION: readonly Destino[] = [
  DESTINOS.negocio,
  DESTINOS.catalogo,
  DESTINOS.usuarios,
]

export function puedeVer(destino: Destino, rol: Role): boolean {
  return destino.roles.includes(rol)
}
