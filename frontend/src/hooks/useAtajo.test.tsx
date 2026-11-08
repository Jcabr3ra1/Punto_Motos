import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAtajo } from './useAtajo'

function ConAtajo({ alPulsar, activo }: { alPulsar: () => void; activo?: boolean }) {
  useAtajo('n', alPulsar, activo)
  return <p>pantalla</p>
}

afterEach(() => {
  document.querySelectorAll('[role="dialog"]').forEach((ventana) => ventana.remove())
})

describe('useAtajo', () => {
  it('Ctrl+N llama a la acción', async () => {
    const alPulsar = vi.fn()
    render(<ConAtajo alPulsar={alPulsar} />)

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(alPulsar).toHaveBeenCalledOnce()
  })

  it('no actúa con un diálogo abierto', async () => {
    const alPulsar = vi.fn()
    render(<ConAtajo alPulsar={alPulsar} />)
    document.body.append(Object.assign(document.createElement('div'), { role: 'dialog' }))
    document.body.lastElementChild?.setAttribute('role', 'dialog')

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(alPulsar).not.toHaveBeenCalled()
  })

  it('no actúa si la tecla se repite', async () => {
    const alPulsar = vi.fn()
    render(<ConAtajo alPulsar={alPulsar} />)

    await userEvent.setup().keyboard('{Control>}{n>3/}{/Control}')

    expect(alPulsar).toHaveBeenCalledOnce()
  })

  it('no actúa cuando está desactivado', async () => {
    const alPulsar = vi.fn()
    render(<ConAtajo alPulsar={alPulsar} activo={false} />)

    await userEvent.setup().keyboard('{Control>}n{/Control}')

    expect(alPulsar).not.toHaveBeenCalled()
  })
})
