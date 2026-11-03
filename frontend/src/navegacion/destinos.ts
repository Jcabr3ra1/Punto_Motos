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
  vender: { ruta: '/venta/vender', etiqueta: 'Vender', roles: TODOS },
  ventas: { ruta: '/venta/historial', etiqueta: 'Ventas', roles: TODOS },
  productos: { ruta: '/productos', etiqueta: 'Productos', roles: TODOS },
  movimientos: { ruta: '/inventario/movimientos', etiqueta: 'Movimientos', roles: TODOS },
  inventarioInicial: {
    ruta: '/inventario-inicial',
    etiqueta: 'Inventario inicial',
    roles: SOLO_DUENO,
    soloConConteoAbierto: true,
  },
  compras: { ruta: '/compras', etiqueta: 'Compras', roles: SOLO_DUENO },
  comprasLista: { ruta: '/compras/lista', etiqueta: 'Compras', roles: SOLO_DUENO },
  proveedores: { ruta: '/compras/proveedores', etiqueta: 'Proveedores', roles: SOLO_DUENO },
  abonos: { ruta: '/compras/abonos', etiqueta: 'Abonos', roles: SOLO_DUENO },
  caja: { ruta: '/caja', etiqueta: 'Caja', roles: SOLO_DUENO },
  cajaActual: { ruta: '/caja/actual', etiqueta: 'Caja de hoy', roles: SOLO_DUENO },
  cajaHistorial: { ruta: '/caja/historial', etiqueta: 'Cajas anteriores', roles: SOLO_DUENO },
  consignacion: { ruta: '/consignacion', etiqueta: 'Consignación', roles: SOLO_DUENO },
  locales: { ruta: '/consignacion/locales', etiqueta: 'Locales', roles: SOLO_DUENO },
  entregas: { ruta: '/consignacion/entregas', etiqueta: 'Entregas', roles: SOLO_DUENO },
  reportes: { ruta: '/consignacion/reportes', etiqueta: 'Reportes', roles: SOLO_DUENO },
  pagosDeLocales: { ruta: '/consignacion/pagos', etiqueta: 'Pagos', roles: SOLO_DUENO },
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
  DESTINOS.compras,
  DESTINOS.caja,
  DESTINOS.consignacion,
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

export const MENU_COMPRAS: readonly Destino[] = [DESTINOS.comprasLista, DESTINOS.proveedores, DESTINOS.abonos]

export const MENU_VENTA: readonly Destino[] = [DESTINOS.vender, DESTINOS.ventas]

export const MENU_CAJA: readonly Destino[] = [DESTINOS.cajaActual, DESTINOS.cajaHistorial]

export const MENU_CONSIGNACION: readonly Destino[] = [
  DESTINOS.locales,
  DESTINOS.entregas,
  DESTINOS.reportes,
  DESTINOS.pagosDeLocales,
]
