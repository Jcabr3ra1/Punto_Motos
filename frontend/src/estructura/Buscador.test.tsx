import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueno, simularApi, vendedor } from '../test/apiSimulada'
import { pagina, producto } from '../test/datos'
import { mostrarRutas } from '../test/mostrar'

beforeEach(() => {
  simularApi({
    'GET /settings/business': () => ({
      cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: '2026-11-01T08:00:00-05:00' },
    }),
    'GET /products*': () => ({ cuerpo: pagina([producto()]) }),
    'GET /inventory/initial-count': () => ({ cuerpo: { is_open: false } }),
    'GET /suppliers*': () => ({ cuerpo: [] }),
    'GET /supplier-payments*': () => ({ cuerpo: pagina([]) }),
    'GET /purchases*': () => ({ cuerpo: pagina([]) }),
    'GET /cash/current': () => ({ cuerpo: { is_open: false } }),
  })
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

const abrirConTeclado = (u: ReturnType<typeof userEvent.setup>) => u.keyboard('{Control>}k{/Control}')

describe('buscador de pantallas', () => {
  it('Ctrl+K abre el buscador con el foco en el campo', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await abrirConTeclado(u)

    const buscador = screen.getByRole('dialog', { name: 'Buscar pantalla' })
    expect(within(buscador).getByRole('combobox')).toHaveFocus()
  })

  it('el botón de la barra superior también lo abre', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await u.click(screen.getByRole('button', { name: /Buscar pantalla/ }))

    expect(screen.getByRole('dialog', { name: 'Buscar pantalla' })).toBeInTheDocument()
  })

  it('Enter abre la pantalla elegida y cierra el buscador', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await abrirConTeclado(u)
    await u.keyboard('abonos')
    await u.keyboard('{Enter}')

    expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Compras' })).getByRole('link', { name: 'Abonos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('las flechas mueven la opción activa', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await abrirConTeclado(u)
    await u.keyboard('caja')
    const campo = screen.getByRole('combobox')
    const opciones = screen.getAllByRole('option')
    expect(campo).toHaveAttribute('aria-activedescendant', opciones[0].id)

    await u.keyboard('{ArrowDown}')
    expect(campo).toHaveAttribute('aria-activedescendant', opciones[1].id)
    expect(opciones[1]).toHaveAttribute('aria-selected', 'true')

    await u.keyboard('{ArrowUp}')
    expect(campo).toHaveAttribute('aria-activedescendant', opciones[0].id)
  })

  it('dice cuándo no hay resultados', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await abrirConTeclado(u)
    await u.keyboard('zzzz')

    expect(screen.getByText(/Ninguna pantalla coincide con «zzzz»/)).toBeInTheDocument()
  })

  it('el vendedor no encuentra pantallas del dueño', async () => {
    mostrarRutas(vendedor)
    const u = userEvent.setup()

    await abrirConTeclado(u)
    await u.keyboard('caja')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('Esc cierra y devuelve el foco a donde estaba', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()
    const boton = screen.getByRole('button', { name: /Buscar pantalla/ })

    await u.click(boton)
    await u.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument()
    expect(boton).toHaveFocus()
  })

  it('un clic fuera del buscador lo cierra', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()

    await abrirConTeclado(u)
    await u.click(document.querySelector('.buscador-pantallas__velo')!)

    expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument()
  })

  it('Ctrl+K no abre el buscador encima de otra ventana', async () => {
    mostrarRutas(dueno)
    const u = userEvent.setup()
    const otra = document.createElement('div')
    otra.setAttribute('role', 'dialog')
    document.body.append(otra)

    await abrirConTeclado(u)

    expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument()
    otra.remove()
  })
})
