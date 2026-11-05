import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { Actualizaciones } from './Actualizaciones'

const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri }))
// JSDOM no implementa el diálogo modal del navegador.
beforeAll(() => Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') },
}))
afterEach(() => { vi.resetAllMocks(); isTauri.mockReturnValue(true) })

function mostrar() {
  render(<QueryClientProvider client={new QueryClient()}><Actualizaciones /></QueryClientProvider>)
}

it('no busca actualizaciones en navegador', () => {
  isTauri.mockReturnValue(false)
  mostrar()
  expect(invoke).not.toHaveBeenCalled()
})

it('ofrece la versión nueva sin instalarla hasta confirmar', async () => {
  invoke.mockResolvedValue({ version: '0.2.0', notes: 'Mejoras de inventario' })
  mostrar()
  expect(await screen.findByText(/0.2.0/)).toBeInTheDocument()
  expect(screen.getByText('Mejoras de inventario')).toBeInTheDocument()
  expect(invoke.mock.calls).toEqual([['check_update']])
  const u = userEvent.setup()
  await u.click(screen.getByRole('button', { name: 'Actualizar y reiniciar' }))
  expect(screen.getByRole('button', { name: 'Instalar ahora' })).toBeInTheDocument()
  expect(invoke.mock.calls).toHaveLength(1)
})

it('sin internet permite reintentar sin bloquear el resto de Inicio', async () => {
  invoke.mockRejectedValueOnce('offline').mockResolvedValueOnce(null)
  mostrar()
  expect(await screen.findByRole('status')).toHaveTextContent('No se pudo buscar')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Buscar actualizaciones' }))
  expect(await screen.findByText('Tienes la versión más reciente.')).toBeInTheDocument()
})

it('un fallo al instalar se muestra y libera la pantalla', async () => {
  invoke.mockImplementation((command) => command === 'check_update'
    ? Promise.resolve({ version: '0.2.0', notes: '' }) : Promise.reject('fallo'))
  mostrar()
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Actualizar y reiniciar' }))
  await userEvent.setup().click(screen.getByRole('button', { name: 'Instalar ahora' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo instalar')
})
