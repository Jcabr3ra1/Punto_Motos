import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSeleccion } from './useSeleccion'

const filas = [{ id: 1 }, { id: 2 }, { id: 3 }]
const tecla = (key: string) => ({ key, preventDefault: () => {} }) as React.KeyboardEvent

describe('useSeleccion', () => {
  it('elige una fila y la cierra', () => {
    const { result } = renderHook(() => useSeleccion(filas, (f) => f.id))

    act(() => result.current.elegir(filas[1]))
    expect(result.current.elegido).toBe(filas[1])

    act(() => result.current.cerrar())
    expect(result.current.elegido).toBeNull()
  })

  it('las flechas mueven la selección sin salirse de la lista', () => {
    const { result } = renderHook(() => useSeleccion(filas, (f) => f.id))

    act(() => result.current.alTeclear(tecla('ArrowDown')))
    expect(result.current.elegido).toBe(filas[0])
    act(() => result.current.alTeclear(tecla('ArrowDown')))
    act(() => result.current.alTeclear(tecla('ArrowDown')))
    act(() => result.current.alTeclear(tecla('ArrowDown')))
    expect(result.current.elegido).toBe(filas[2])
    act(() => result.current.alTeclear(tecla('ArrowUp')))
    expect(result.current.elegido).toBe(filas[1])
  })

  it('si la fila deja de estar en la lista, la ficha se cierra', () => {
    const { result, rerender } = renderHook(({ lista }) => useSeleccion(lista, (f) => f.id), { initialProps: { lista: filas } })
    act(() => result.current.elegir(filas[2]))

    rerender({ lista: filas.slice(0, 2) })

    expect(result.current.elegido).toBeNull()
  })

  it('si la fila sigue con datos nuevos, muestra los nuevos', () => {
    const { result, rerender } = renderHook(({ lista }) => useSeleccion(lista, (f) => f.id), {
      initialProps: { lista: [{ id: 1, n: 'a' }] },
    })
    act(() => result.current.elegir(result.current.elegido ?? { id: 1, n: 'a' }))

    rerender({ lista: [{ id: 1, n: 'b' }] })

    expect(result.current.elegido).toEqual({ id: 1, n: 'b' })
  })
})
