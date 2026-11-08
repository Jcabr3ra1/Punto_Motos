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
    expect(within(screen.getByRole('group', { name: 'Compras' })).getByRole('link', { name: 'Abonos' })).toHaveAttribute(
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

  it('Ctrl+K y Ctrl+B no actúan con una confirmación o un diálogo nativo abiertos', async () => {
    mostrarRutas(dueno, '/compras/proveedores')
    const u = userEvent.setup()
    for (const otra of [Object.assign(document.createElement('div'), { role: 'alertdialog' }), document.createElement('dialog')]) {
      if (otra instanceof HTMLDialogElement) otra.setAttribute('open', '')
      else otra.setAttribute('role', 'alertdialog')
      document.body.append(otra)

      await abrirConTeclado(u)
      await u.keyboard('{Control>}b{/Control}')

      expect(screen.queryByRole('dialog', { name: 'Buscar pantalla' })).not.toBeInTheDocument()
      expect(document.querySelector('.menu-lateral--recogido')).toBeNull()
      otra.remove()
    }
  })

  it('al cerrar, devuelve el foco cuando la pantalla ya no está inerte', async () => {
    const raiz = document.createElement('div')
    raiz.id = 'root'
    document.body.append(raiz)
    mostrarRutas(dueno, '/', raiz)
    const u = userEvent.setup()
    const boton = screen.getByRole('button', { name: /Buscar pantalla/ })
    const original = HTMLElement.prototype.focus
    // Anota, en cada intento de enfocar algo de la pantalla, si en ese momento seguía inerte.
    const intentos: boolean[] = []
    const enfocar = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, opciones) {
      if (raiz.contains(this)) intentos.push(Boolean(this.closest('[inert]')))
      original.call(this, opciones)
    })

    await u.click(boton)
    intentos.length = 0
    await u.keyboard('{Escape}')

    expect(intentos.length).toBeGreaterThan(0)
    expect(intentos).not.toContain(true)
    expect(boton).toHaveFocus()
    enfocar.mockRestore()
    raiz.remove()
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
