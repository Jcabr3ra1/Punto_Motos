import { describe, expect, it } from 'vitest'
import { ubicacionDe } from './ubicacion'

describe('ubicacionDe', () => {
  it.each([
    ['/', { seccion: 'Inicio' }],
    ['/venta/vender', { seccion: 'Venta', pestana: 'Vender' }],
    ['/venta/historial/41', { seccion: 'Venta', pestana: 'Ventas' }],
    ['/compras/proveedores', { seccion: 'Compras', pestana: 'Proveedores' }],
    ['/compras/lista/15', { seccion: 'Compras' }],
    ['/configuracion/mecanicos', { seccion: 'Configuración', pestana: 'Mecánicos' }],
    ['/productos', { seccion: 'Productos' }],
    ['/no-existe', { seccion: '' }],
  ])('%s', (ruta, esperado) => {
    expect(ubicacionDe(ruta)).toEqual(esperado)
  })
})
