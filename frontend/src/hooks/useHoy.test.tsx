import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHoy } from './useHoy'

afterEach(() => {
  vi.useRealTimers()
})

describe('useHoy', () => {
  it('cambia de día al pasar la medianoche de Colombia aunque nada más cambie', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-07T23:59:30-05:00'))
    const { result } = renderHook(() => useHoy())
    expect(result.current).toBe('2026-11-07')

    act(() => vi.advanceTimersByTime(60_000))

    expect(result.current).toBe('2026-11-08')
  })
})
