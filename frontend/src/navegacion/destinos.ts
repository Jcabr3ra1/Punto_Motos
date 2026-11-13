import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  Building,
  Building2,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileText,
  HandCoins,
  HardHat,
  History,
  House,
  ListChecks,
  Package,
  PackageOpen,
  RefreshCw,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Undo2,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '../api/types'

// Única fuente de verdad de qué pantallas existen y quién puede verlas.
// El menú y las rutas protegidas salen de aquí. Aunque se oculte una pantalla,
// el backend sigue rechazando con 403 lo que el rol no permite (docs/backend/API.md#roles-y-permisos).

export interface Destino {
  ruta: string
  etiqueta: string
  roles: readonly Role[]
  /** Icono del menú, el buscador y los accesos rápidos. */
  icono: LucideIcon
  /** Para qué sirve, en pocas palabras: se muestra bajo el nombre en el panel y el buscador. */
  descripcion: string
  /** Solo se muestra en el menú mientras el inventario inicial siga abierto. */
  soloConConteoAbierto?: boolean
}

const TODOS: readonly Role[] = ['owner', 'seller']
const SOLO_DUENO: readonly Role[] = ['owner']

export const DESTINOS = {
  inicio: { icono: House, descripcion: 'Resumen del día y accesos rápidos', ruta: '/', etiqueta: 'Inicio', roles: TODOS },
  venta: { icono: ShoppingCart, descripcion: 'Cobrar en el mostrador y revisar lo vendido', ruta: '/venta', etiqueta: 'Mostrador', roles: TODOS },
  vender: { icono: ShoppingCart, descripcion: 'Carrito y cobro', ruta: '/venta/vender', etiqueta: 'Vender', roles: TODOS },
  ventas: { icono: ReceiptText, descripcion: 'Historial y anulación', ruta: '/venta/historial', etiqueta: 'Ventas', roles: TODOS },
  resumenVentas: { icono: ClipboardCheck, descripcion: 'Totales por tipo, servicio y producto', ruta: '/venta/resumen', etiqueta: 'Resumen', roles: SOLO_DUENO },
  devoluciones: { icono: Undo2, descripcion: 'Lo que los clientes devolvieron', ruta: '/venta/devoluciones', etiqueta: 'Devoluciones', roles: TODOS },
  inventario: { icono: Boxes, descripcion: 'Productos, existencias y clasificación', ruta: '/inventario', etiqueta: 'Inventario', roles: TODOS },
  productos: { icono: Package, descripcion: 'Existencias, precios y códigos', ruta: '/inventario/productos', etiqueta: 'Productos', roles: TODOS },
  movimientos: { icono: ArrowLeftRight, descripcion: 'Entradas, salidas y ajustes', ruta: '/inventario/movimientos', etiqueta: 'Movimientos', roles: TODOS },
  inventarioInicial: { icono: ClipboardList, descripcion: 'Conteo de lo que hay al empezar',
    ruta: '/inventario/inicial',
    etiqueta: 'Inventario inicial',
    roles: SOLO_DUENO,
    soloConConteoAbierto: true,
  },
  compras: { icono: Truck, descripcion: 'Mercancía que llega de los proveedores', ruta: '/compras', etiqueta: 'Compras', roles: SOLO_DUENO },
  comprasLista: { icono: FileText, descripcion: 'Borradores y compras recibidas', ruta: '/compras/lista', etiqueta: 'Compras', roles: SOLO_DUENO },
  proveedores: { icono: Building2, descripcion: 'Datos y estado de cuenta', ruta: '/compras/proveedores', etiqueta: 'Proveedores', roles: SOLO_DUENO },
  abonos: { icono: HandCoins, descripcion: 'Pagos a los proveedores', ruta: '/compras/abonos', etiqueta: 'Abonos', roles: SOLO_DUENO },
  caja: { icono: Wallet, descripcion: 'Efectivo del día, gastos y cierres', ruta: '/caja', etiqueta: 'Caja', roles: SOLO_DUENO },
  cajaActual: { icono: Banknote, descripcion: 'Apertura, gastos y cierre', ruta: '/caja/actual', etiqueta: 'Caja de hoy', roles: SOLO_DUENO },
  cajaHistorial: { icono: History, descripcion: 'Cierres de días anteriores', ruta: '/caja/historial', etiqueta: 'Cajas anteriores', roles: SOLO_DUENO },
  consignacion: { icono: Store, descripcion: 'Mercancía en otros locales', ruta: '/consignacion', etiqueta: 'Consignación', roles: SOLO_DUENO },
  locales: { icono: Store, descripcion: 'Locales y lo que tienen', ruta: '/consignacion/locales', etiqueta: 'Locales', roles: SOLO_DUENO },
  entregas: { icono: PackageOpen, descripcion: 'Mercancía que sale a un local', ruta: '/consignacion/entregas', etiqueta: 'Entregas', roles: SOLO_DUENO },
  reportes: { icono: ClipboardCheck, descripcion: 'Lo que vendió o devolvió cada local', ruta: '/consignacion/reportes', etiqueta: 'Reportes', roles: SOLO_DUENO },
  pagosDeLocales: { icono: HandCoins, descripcion: 'Lo que pagan los locales', ruta: '/consignacion/pagos', etiqueta: 'Pagos', roles: SOLO_DUENO },
  taller: { icono: Wrench, descripcion: 'Lo que se le paga a cada mecánico', ruta: '/taller', etiqueta: 'Taller', roles: SOLO_DUENO },
  liquidacion: { icono: Calculator, descripcion: 'Servicios por pagar hoy', ruta: '/taller/liquidacion', etiqueta: 'Liquidación del día', roles: SOLO_DUENO },
  historialDeLiquidaciones: { icono: History, descripcion: 'Liquidaciones anteriores', ruta: '/taller/historial', etiqueta: 'Historial de liquidaciones', roles: SOLO_DUENO },
  configuracion: { icono: Settings, descripcion: 'Negocio, catálogo y usuarios', ruta: '/configuracion', etiqueta: 'Configuración', roles: TODOS },
  negocio: { icono: Building, descripcion: 'Nombre y datos del negocio', ruta: '/configuracion/negocio', etiqueta: 'Datos del negocio', roles: TODOS },
  catalogo: { icono: Tags, descripcion: 'Organiza tipos de repuesto, marcas y modelos de moto', ruta: '/inventario/catalogo', etiqueta: 'Tipos, marcas y motos', roles: SOLO_DUENO },
  usuarios: { icono: Users, descripcion: 'Quién entra al programa', ruta: '/configuracion/usuarios', etiqueta: 'Usuarios', roles: SOLO_DUENO },
  tiposDeServicio: { icono: ListChecks, descripcion: 'Servicios que ofrece el taller', ruta: '/taller/servicios', etiqueta: 'Tipos de servicio', roles: SOLO_DUENO },
  mecanicos: { icono: HardHat, descripcion: 'Mecánicos y su porcentaje', ruta: '/taller/mecanicos', etiqueta: 'Mecánicos', roles: SOLO_DUENO },
  actualizaciones: { icono: RefreshCw, descripcion: 'Buscar e instalar una versión nueva', ruta: '/configuracion/actualizaciones', etiqueta: 'Actualizar programa', roles: SOLO_DUENO },
} as const satisfies Record<string, Destino>

export const MENU_PRINCIPAL: readonly Destino[] = [
  DESTINOS.inicio,
  DESTINOS.venta,
  DESTINOS.inventario,
  DESTINOS.taller,
  DESTINOS.compras,
  DESTINOS.caja,
  DESTINOS.consignacion,
  DESTINOS.configuracion,
]

export const MENU_CONFIGURACION: readonly Destino[] = [DESTINOS.negocio, DESTINOS.usuarios, DESTINOS.actualizaciones]

export const MENU_INVENTARIO: readonly Destino[] = [
  DESTINOS.productos,
  DESTINOS.movimientos,
  DESTINOS.inventarioInicial,
  DESTINOS.catalogo,
]

export function puedeVer(destino: Destino, rol: Role): boolean {
  return destino.roles.includes(rol)
}

export const MENU_COMPRAS: readonly Destino[] = [DESTINOS.comprasLista, DESTINOS.proveedores, DESTINOS.abonos]

export const MENU_VENTA: readonly Destino[] = [DESTINOS.vender, DESTINOS.ventas, DESTINOS.resumenVentas, DESTINOS.devoluciones]

export const MENU_CAJA: readonly Destino[] = [DESTINOS.cajaActual, DESTINOS.cajaHistorial]

export const MENU_CONSIGNACION: readonly Destino[] = [
  DESTINOS.locales,
  DESTINOS.entregas,
  DESTINOS.reportes,
  DESTINOS.pagosDeLocales,
]

export const MENU_TALLER: readonly Destino[] = [
  DESTINOS.liquidacion,
  DESTINOS.historialDeLiquidaciones,
  DESTINOS.mecanicos,
  DESTINOS.tiposDeServicio,
]

/** Pantallas de cada módulo del menú principal, por la ruta del módulo. */
export const SUBMENUS: Readonly<Record<string, readonly Destino[]>> = {
  [DESTINOS.venta.ruta]: MENU_VENTA,
  [DESTINOS.inventario.ruta]: MENU_INVENTARIO,
  [DESTINOS.compras.ruta]: MENU_COMPRAS,
  [DESTINOS.caja.ruta]: MENU_CAJA,
  [DESTINOS.consignacion.ruta]: MENU_CONSIGNACION,
  [DESTINOS.taller.ruta]: MENU_TALLER,
  [DESTINOS.configuracion.ruta]: MENU_CONFIGURACION,
}

/** Las pantallas de un módulo que el rol puede ver; un módulo sin submenú es su propia pantalla. */
export function pantallasDe(modulo: Destino, rol: Role): readonly Destino[] {
  return (SUBMENUS[modulo.ruta] ?? [modulo]).filter((destino) => puedeVer(destino, rol))
}

/** Las pantallas de una sección que se muestran: las del rol y, el inventario inicial, solo con el conteo abierto. */
export function pantallasVisibles(modulo: Destino, rol: Role, conteoAbierto: boolean): readonly Destino[] {
  return pantallasDe(modulo, rol).filter((destino) => !destino.soloConConteoAbierto || conteoAbierto)
}

/** Direcciones de antes del menú por secciones y a dónde llevan ahora. */
export const RUTAS_ANTERIORES: Readonly<Record<string, string>> = {
  '/productos': DESTINOS.productos.ruta,
  '/inventario-inicial': DESTINOS.inventarioInicial.ruta,
  '/configuracion/catalogo': DESTINOS.catalogo.ruta,
  '/configuracion/mecanicos': DESTINOS.mecanicos.ruta,
  '/configuracion/servicios': DESTINOS.tiposDeServicio.ruta,
}
