import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearClienteDeConsultas } from '../api/consultas'
import { errorDeApi, simularApi } from '../test/apiSimulada'
import { frenos, producto } from '../test/datos'
import { BuscadorDeProductos } from './BuscadorDeProductos'

const sinStock = producto({ id: 3, code: 'LL909018', name: 'Llanta 90/90 rin 18', category: frenos, stock: 0, is_low_stock: true })
const pastillas = producto({ id: 1, stock: 5 })
const boxer = producto({ id: 2, code: 'FRE-BOX-PAS', name: 'Pastillas de freno Boxer', stock: 2, sale_price: 21000 })

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(rutas: Parameters<typeof simularApi>[0] = {}) {
  const api = simularApi({
    // El primero no tiene existencias: sirve para comprobar que el teclado lo salta.
    'GET /catalog/search*': () => ({ cuerpo: [sinStock, pastillas, boxer] }),
    ...rutas,
  })
  const alElegir = vi.fn()
  render(
    <QueryClientProvider client={crearClienteDeConsultas()}>
      <BuscadorDeProductos onElegir={alElegir} />
    </QueryClientProvider>,
  )
  return { api, alElegir, u: userEvent.setup(), buscador: await screen.findByRole('combobox', { name: 'Buscar producto' }) }
}

const llamadasDeBusqueda = (api: { llamadas: { clave: string }[] }) =>
  api.llamadas.filter((l) => l.clave.startsWith('GET /catalog/search'))

describe('buscador', () => {
  it('empieza con el foco en el campo y no consulta con menos de 2 caracteres', async () => {
    const { api, u, buscador } = await abrir()

    expect(buscador).toHaveFocus()
    await u.type(buscador, 'p')
    await new Promise((r) => setTimeout(r, 400))

    expect(llamadasDeBusqueda(api)).toHaveLength(0)
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('busca con una pausa corta: una sola llamada aunque se escriba rápido', async () => {
    const { api, u, buscador } = await abrir()

    await u.type(buscador, 'pastillas')

    await waitFor(() => expect(llamadasDeBusqueda(api)).toHaveLength(1))
    expect(llamadasDeBusqueda(api)[0].clave).toBe('GET /catalog/search?q=pastillas')
  })

  it('muestra código, nombre, precio y existencia, y deja sin elegir lo que no tiene existencias', async () => {
    const { u, buscador } = await abrir()

    await u.type(buscador, 'pas')

    const opcion = await screen.findByRole('option', { name: /FRE-PUL-PAS/ })
    expect(opcion).toHaveTextContent('Pastillas de freno Pulsar 180')
    expect(opcion).toHaveTextContent(/\$\s?25\.000/)
    expect(opcion).toHaveTextContent('Hay 5')

    const agotado = screen.getByRole('option', { name: /LL909018/ })
    expect(agotado).toHaveAttribute('aria-disabled', 'true')
    expect(agotado).toHaveTextContent('Sin existencias')
    expect(screen.getByText('3 resultados')).toBeInTheDocument()
  })

  it('avisa cuando no encuentra nada', async () => {
    const { u, buscador } = await abrir({ 'GET /catalog/search*': () => ({ cuerpo: [] }) })

    await u.type(buscador, 'zzz')

    expect(await screen.findByText('No se encontró ningún producto.')).toBeInTheDocument()
  })

  it('muestra el error si la búsqueda falla', async () => {
    const { u, buscador } = await abrir({
      'GET /catalog/search*': () => errorDeApi(500, 'server_error', 'Fallo del programa.'),
    })

    await u.type(buscador, 'pas')

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo del programa.')
  })

  it('Escape borra lo escrito', async () => {
    const { u, buscador } = await abrir()

    await u.type(buscador, 'pas')
    await screen.findByRole('option', { name: /FRE-PUL-PAS/ })
    await u.keyboard('{Escape}')

    expect(buscador).toHaveValue('')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})

describe('elegir con el teclado', () => {
  it('Enter elige el primer producto con existencias, salta el agotado y deja el campo listo', async () => {
    const { u, buscador, alElegir } = await abrir()

    await u.type(buscador, 'pas')
    await screen.findByRole('option', { name: /FRE-PUL-PAS/ })
    expect(buscador).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('option', { name: /FRE-PUL-PAS/ })).toHaveAttribute('aria-selected', 'true')
    await u.keyboard('{Enter}')

    expect(alElegir).toHaveBeenCalledTimes(1)
    expect(alElegir).toHaveBeenCalledWith(pastillas)
    expect(buscador).toHaveValue('')
    expect(buscador).toHaveFocus()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('las flechas se mueven entre los productos que se pueden elegir', async () => {
    const { u, buscador, alElegir } = await abrir()

    await u.type(buscador, 'pas')
    await screen.findByRole('option', { name: /FRE-PUL-PAS/ })
    await u.keyboard('{ArrowDown}')

    const segundo = screen.getByRole('option', { name: /FRE-BOX-PAS/ })
    expect(segundo).toHaveAttribute('aria-selected', 'true')
    expect(buscador).toHaveAttribute('aria-activedescendant', segundo.id)

    await u.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: /FRE-PUL-PAS/ })).toHaveAttribute('aria-selected', 'true')
    await u.keyboard('{ArrowUp}')
    expect(screen.getByRole('option', { name: /FRE-BOX-PAS/ })).toHaveAttribute('aria-selected', 'true')

    await u.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith(boxer)
  })

  it('con el ratón elige el producto sin quitarle el foco al campo', async () => {
    const { u, buscador, alElegir } = await abrir()

    await u.type(buscador, 'pas')
    await u.click(await screen.findByRole('option', { name: /FRE-BOX-PAS/ }))

    expect(alElegir).toHaveBeenCalledWith(boxer)
    expect(buscador).toHaveFocus()
  })

  it('un producto sin existencias no se puede agregar', async () => {
    const { u, buscador, alElegir } = await abrir()

    await u.type(buscador, 'pas')
    await u.click(await screen.findByRole('option', { name: /LL909018/ }))

    expect(alElegir).not.toHaveBeenCalled()
    expect(buscador).toHaveValue('pas')
  })
})

describe('resultados de la búsqueda anterior', () => {
  it('mientras llegan los nuevos, Enter no elige el producto de la búsqueda anterior', async () => {
    const { u, buscador, alElegir } = await abrir({
      'GET /catalog/search*': (_, ruta) => ({ cuerpo: ruta.includes('q=bo') ? [boxer] : [sinStock, pastillas, boxer] }),
    })

    await u.type(buscador, 'pas')
    await screen.findByRole('option', { name: /FRE-PUL-PAS/, selected: true })
    await u.clear(buscador)
    await u.type(buscador, 'bo')
    // Todavía se ven los resultados de «pas», pero no se pueden elegir.
    expect(screen.getByText('Buscando…')).toBeInTheDocument()
    await u.keyboard('{Enter}')
    expect(alElegir).not.toHaveBeenCalled()

    await screen.findByText('1 resultado')
    await u.keyboard('{Enter}')
    expect(alElegir).toHaveBeenCalledWith(boxer)
  })
})

