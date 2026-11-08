import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTamanoDeVentana } from './useTamanoDeVentana'

const llamadas: string[] = []
const ventana = {
  setResizable: vi.fn(async (v: boolean) => void llamadas.push(`resizable:${v}`)),
  setMaximizable: vi.fn(async (v: boolean) => void llamadas.push(`maximizable:${v}`)),
  setMinSize: vi.fn(async (t: { width: number; height: number } | null) => void llamadas.push(`min:${t ? `${t.width}x${t.height}` : 'ninguno'}`)),
  setSize: vi.fn(async (t: { width: number; height: number }) => void llamadas.push(`tam:${t.width}x${t.height}`)),
  center: vi.fn(async () => void llamadas.push('centrar')),
  isMaximized: vi.fn(async () => false),
  unmaximize: vi.fn(async () => void llamadas.push('desmaximizar')),
}
const isTauri = vi.fn(() => true)
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ventana }))

afterEach(() => {
  llamadas.length = 0
  vi.clearAllMocks()
  isTauri.mockReturnValue(true)
  ventana.isMaximized.mockResolvedValue(false)
})

describe('useTamanoDeVentana', () => {
  it('al abrir la sesión agranda y centra la ventana', async () => {
    const { rerender } = renderHook(({ conSesion }) => useTamanoDeVentana(conSesion), { initialProps: { conSesion: false } })
    expect(llamadas).toEqual([])

    rerender({ conSesion: true })

    await waitFor(() => expect(llamadas).toEqual(['resizable:true', 'maximizable:true', 'min:900x560', 'tam:1280x800', 'centrar']))
  })

  it('si el programa arranca con la sesión abierta, también agranda', async () => {
    renderHook(() => useTamanoDeVentana(true))

    await waitFor(() => expect(llamadas).toContain('tam:1280x800'))
  })

  it('al cerrar la sesión vuelve a 760 × 500 sin poder redimensionar', async () => {
    ventana.isMaximized.mockResolvedValue(true)
    const { rerender } = renderHook(({ conSesion }) => useTamanoDeVentana(conSesion), { initialProps: { conSesion: true } })
    await waitFor(() => expect(llamadas).toContain('centrar'))
    llamadas.length = 0

    rerender({ conSesion: false })

    await waitFor(() =>
      expect(llamadas).toEqual(['desmaximizar', 'min:ninguno', 'tam:760x500', 'resizable:false', 'maximizable:false', 'centrar']),
    )
  })

  it('fuera de Tauri no llama a nada', async () => {
    isTauri.mockReturnValue(false)
    const { rerender } = renderHook(({ conSesion }) => useTamanoDeVentana(conSesion), { initialProps: { conSesion: false } })
    rerender({ conSesion: true })

    await new Promise((listo) => setTimeout(listo, 10))
    expect(llamadas).toEqual([])
  })

  it('si la sesión se cierra mientras la ventana crece, termina pequeña', async () => {
    let soltar!: () => void
    ventana.setResizable.mockImplementationOnce(async (v: boolean) => {
      llamadas.push(`resizable:${v}`)
      await new Promise<void>((listo) => (soltar = listo))
    })
    const { rerender } = renderHook(({ conSesion }) => useTamanoDeVentana(conSesion), { initialProps: { conSesion: true } })
    await waitFor(() => expect(llamadas).toContain('resizable:true'))

    rerender({ conSesion: false })
    soltar()

    await waitFor(() => expect(llamadas.at(-1)).toBe('centrar'))
    await new Promise((listo) => setTimeout(listo, 10))
    const ultimoTamano = llamadas.filter((l) => l.startsWith('tam:')).at(-1)
    expect(ultimoTamano).toBe('tam:760x500')
    expect(llamadas.filter((l) => l.startsWith('resizable:')).at(-1)).toBe('resizable:false')
  })
})
