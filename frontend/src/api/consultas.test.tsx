import { QueryClientProvider, onlineManager, useMutation, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearClienteDeConsultas } from './consultas'

function PantallaDePrueba({
  cargar,
  guardar,
}: {
  cargar: () => Promise<string>
  guardar: () => Promise<string>
}) {
  const consulta = useQuery({ queryKey: ['prueba'], queryFn: cargar })
  const mutacion = useMutation({ mutationFn: guardar })

  return (
    <div>
      <p>{consulta.isPending ? 'Cargando…' : consulta.data}</p>
      <button type="button" onClick={() => mutacion.mutate()} disabled={mutacion.isPending}>
        {mutacion.isPending ? 'Guardando…' : mutacion.isSuccess ? mutacion.data : 'Guardar'}
      </button>
    </div>
  )
}

describe('crearClienteDeConsultas', () => {
  beforeEach(() => {
    onlineManager.setOnline(false)
  })

  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it('ejecuta consultas y mutaciones locales aunque el equipo esté sin internet', async () => {
    const cargar = vi.fn(async () => 'Datos cargados')
    const guardar = vi.fn(async () => 'Guardado')

    render(
      <QueryClientProvider client={crearClienteDeConsultas()}>
        <PantallaDePrueba cargar={cargar} guardar={guardar} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Datos cargados')).toBeInTheDocument()
    expect(cargar).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('button', { name: 'Guardado' })).toBeInTheDocument()
    expect(guardar).toHaveBeenCalledTimes(1)
  })
})
