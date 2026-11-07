import { describe, expect, it } from 'vitest'
import { DESTINOS } from './destinos'
import { buscarPantallas } from './buscar'

const rutas = (resultados: ReturnType<typeof buscarPantallas>) => resultados.map((r) => r.destino.ruta)

describe('buscarPantallas', () => {
  it('encuentra sin tildes y dice a qué módulo pertenece', () => {
    const [primero] = buscarPantallas('liquidacion', 'owner', false)
    expect(primero.destino).toBe(DESTINOS.liquidacion)
    expect(primero.modulo).toBe(DESTINOS.taller)
  })

  it('no distingue mayúsculas y acepta parte de la palabra', () => {
    expect(rutas(buscarPantallas('PROVEE', 'owner', false))).toContain(DESTINOS.proveedores.ruta)
  })

  it('también busca en la descripción', () => {
    expect(rutas(buscarPantallas('mecanico', 'owner', false))).toContain(DESTINOS.liquidacion.ruta)
  })

  it('el vendedor no encuentra pantallas del dueño', () => {
    expect(buscarPantallas('compras', 'seller', false)).toEqual([])
    expect(rutas(buscarPantallas('caja', 'seller', false))).toEqual([])
  })

  it('el inventario inicial solo aparece con el conteo abierto', () => {
    expect(buscarPantallas('inventario inicial', 'owner', false)).toEqual([])
    expect(rutas(buscarPantallas('inventario inicial', 'owner', true))).toEqual([DESTINOS.inventarioInicial.ruta])
  })

  it('sin texto devuelve todas las pantallas a las que se puede ir, sin los módulos con submenú', () => {
    const todas = rutas(buscarPantallas('', 'seller', false))
    expect(todas).toContain(DESTINOS.vender.ruta)
    expect(todas).not.toContain(DESTINOS.venta.ruta)
    expect(todas).toContain(DESTINOS.productos.ruta)
  })

  it('busca por el comienzo de las palabras, no por letras sueltas en medio', () => {
    // «ca» no debe traer «Locales» (lo-ca-les).
    const encontradas = rutas(buscarPantallas('ca', 'owner', false))
    expect(encontradas.slice(0, 2)).toEqual([DESTINOS.cajaActual.ruta, DESTINOS.cajaHistorial.ruta])
    expect(encontradas).not.toContain(DESTINOS.locales.ruta)
  })

  it('con varias palabras, cada una debe coincidir', () => {
    expect(rutas(buscarPantallas('caja hoy', 'owner', false))).toEqual([DESTINOS.cajaActual.ruta])
  })

  it('las coincidencias por nombre van antes que las de descripción', () => {
    expect(rutas(buscarPantallas('ventas', 'owner', false))[0]).toBe(DESTINOS.ventas.ruta)
  })
})
