import { describe, expect, it } from 'vitest'
import { ubicacionDe } from './ubicacion'

describe('ubicacionDe', () => {
  it.each([
    ['/', { seccion: 'Inicio' }],
    ['/venta/vender', { seccion: 'Mostrador', pestana: 'Vender' }],
    ['/venta/historial/41', { seccion: 'Mostrador', pestana: 'Ventas' }],
    ['/compras/lista/15', { seccion: 'Compras' }],
    ['/taller/mecanicos', { seccion: 'Taller', pestana: 'Mecánicos' }],
    ['/inventario/productos', { seccion: 'Inventario', pestana: 'Productos' }],
    ['/inventario/catalogo', { seccion: 'Inventario', pestana: 'Tipos, marcas y motos' }],
    ['/configuracion/actualizaciones', { seccion: 'Configuración', pestana: 'Actualizar programa' }],
    ['/no-existe', { seccion: '' }],
  ])('%s', (ruta, esperado) => {
    expect(ubicacionDe(ruta)).toEqual(esperado)
  })
})
