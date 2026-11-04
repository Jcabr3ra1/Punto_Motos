import { DESTINOS, MENU_PRINCIPAL, type Destino } from './destinos'

const TODOS: readonly Destino[] = Object.values(DESTINOS)

const coincide = (ruta: string, pathname: string) => pathname === ruta || pathname.startsWith(`${ruta}/`)

/**
 * Dónde está la persona, para la barra superior: la sección del menú y, si la hay, la pestaña.
 * `/compras/proveedores` → { seccion: 'Compras', pestana: 'Proveedores' }.
 */
export function ubicacionDe(pathname: string): { seccion: string; pestana?: string } {
  if (pathname === '/' || pathname === '') return { seccion: DESTINOS.inicio.etiqueta }
  const seccion = MENU_PRINCIPAL.find((d) => d.ruta !== '/' && coincide(d.ruta, pathname))
  if (!seccion) return { seccion: '' }
  // La pestaña es el destino más específico dentro de la sección (la ruta más larga que coincide).
  const pestana = TODOS.filter((d) => d.ruta.startsWith(`${seccion.ruta}/`) && coincide(d.ruta, pathname)).sort(
    (a, b) => b.ruta.length - a.ruta.length,
  )[0]
  return { seccion: seccion.etiqueta, ...(pestana && pestana.etiqueta !== seccion.etiqueta ? { pestana: pestana.etiqueta } : {}) }
}
