import { describe, expect, it } from 'vitest'
import { DESTINOS, MENU_PRINCIPAL, SUBMENUS, pantallasDe, pantallasVisibles } from './destinos'

describe('destinos', () => {
  it('cada destino tiene icono y descripción', () => {
    for (const destino of Object.values(DESTINOS)) {
      expect(['object', 'function'], destino.ruta).toContain(typeof destino.icono)
      expect(destino.descripcion.length, destino.ruta).toBeGreaterThan(0)
    }
  })

  it('pantallasDe filtra por rol', () => {
    expect(pantallasDe(DESTINOS.compras, 'seller')).toEqual([])
    expect(pantallasDe(DESTINOS.venta, 'seller')).toEqual([DESTINOS.vender, DESTINOS.ventas, DESTINOS.devoluciones])
  })

  it('un módulo sin submenú se devuelve solo', () => {
    expect(pantallasDe(DESTINOS.inicio, 'owner')).toEqual([DESTINOS.inicio])
  })

  it('cada módulo del menú principal tiene al menos una pantalla para el dueño', () => {
    for (const modulo of MENU_PRINCIPAL) {
      expect(pantallasDe(modulo, 'owner').length, modulo.ruta).toBeGreaterThan(0)
    }
  })

  it('el menú principal tiene las secciones en orden', () => {
    expect(MENU_PRINCIPAL.map((d) => d.etiqueta)).toEqual([
      'Inicio',
      'Mostrador',
      'Inventario',
      'Taller',
      'Compras',
      'Caja',
      'Consignación',
      'Configuración',
    ])
  })

  it('cada pantalla está en una sola sección', () => {
    const rutas = Object.values(SUBMENUS).flatMap((pantallas) => pantallas.map((p) => p.ruta))
    expect(new Set(rutas).size).toBe(rutas.length)
  })

  it('la ruta de cada pantalla empieza por la de su sección', () => {
    for (const [ruta, pantallas] of Object.entries(SUBMENUS)) {
      for (const pantalla of pantallas) expect(pantalla.ruta.startsWith(`${ruta}/`), pantalla.ruta).toBe(true)
    }
  })

  it('pantallasVisibles oculta el inventario inicial sin conteo abierto', () => {
    const { productos, movimientos, catalogo, inventarioInicial } = DESTINOS
    expect(pantallasVisibles(DESTINOS.inventario, 'owner', false)).toEqual([productos, movimientos, catalogo])
    expect(pantallasVisibles(DESTINOS.inventario, 'owner', true)).toEqual([productos, movimientos, inventarioInicial, catalogo])
    expect(pantallasVisibles(DESTINOS.inventario, 'seller', true)).toEqual([productos, movimientos])
  })

  it('configuración del vendedor solo tiene Datos del negocio', () => {
    expect(pantallasVisibles(DESTINOS.configuracion, 'seller', false)).toEqual([DESTINOS.negocio])
  })
})
