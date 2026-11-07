import { describe, expect, it } from 'vitest'
import { DESTINOS, MENU_PRINCIPAL, pantallasDe } from './destinos'

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
    expect(pantallasDe(DESTINOS.productos, 'owner')).toEqual([DESTINOS.productos])
  })

  it('cada módulo del menú principal tiene al menos una pantalla para el dueño', () => {
    for (const modulo of MENU_PRINCIPAL) {
      expect(pantallasDe(modulo, 'owner').length, modulo.ruta).toBeGreaterThan(0)
    }
  })
})
