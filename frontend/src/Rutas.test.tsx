import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dueno, vendedor, simularApi } from './test/apiSimulada'
import { mostrarRutas as mostrar } from './test/mostrar'

beforeEach(() => {
  // Las pantallas de Configuración piden sus datos al abrirse.
  simularApi({
    'GET /settings/business': () => ({
      cuerpo: { name: 'Punto Moto', tax_id: '', address: '', phone: '', receipt_footer: '', updated_at: '2026-11-01T08:00:00-05:00' },
    }),
    'GET /users': () => ({ cuerpo: [dueno, vendedor] }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const menuPrincipal = () => screen.getByRole('navigation', { name: 'Principal' })
const menuConfiguracion = () => screen.getByRole('navigation', { name: 'Configuración' })

describe('menú principal', () => {
  it('muestra Inicio, Productos y Configuración, y marca la pantalla actual', () => {
    mostrar(dueno)

    const enlaces = within(menuPrincipal()).getAllByRole('link')
    expect(enlaces.map((e) => e.textContent)).toEqual(['Inicio', 'Productos', 'Configuración'])
    expect(within(menuPrincipal()).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page')
  })

  it('muestra el nombre y el rol de quien tiene la sesión abierta', () => {
    mostrar(vendedor)

    expect(screen.getByText('Ana Ruiz', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('Vendedor', { selector: 'p' })).toBeInTheDocument()
  })

  it('navega a otra pantalla al elegirla', async () => {
    mostrar(dueno)

    await userEvent.setup().click(within(menuPrincipal()).getByRole('link', { name: 'Productos' }))

    expect(screen.getByRole('heading', { name: 'Productos' })).toBeInTheDocument()
    expect(within(menuPrincipal()).getByRole('link', { name: 'Productos' })).toHaveAttribute('aria-current', 'page')
  })

  it('cierra la sesión desde el menú', async () => {
    const { cerrarSesion } = mostrar(dueno)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(cerrarSesion).toHaveBeenCalledTimes(1)
  })
})

describe('configuración', () => {
  it('entra a Datos del negocio por defecto', () => {
    mostrar(dueno, '/configuracion')

    expect(screen.getByRole('heading', { name: 'Datos del negocio' })).toBeInTheDocument()
  })

  it.each(['/configuracion/negocio', '/configuracion/usuarios'])(
    'la pantalla %s tiene un solo título principal',
    (ruta) => {
      mostrar(dueno, ruta)

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    },
  )

  it('el aviso de falta de permiso no agrega otro título principal', () => {
    mostrar(vendedor, '/configuracion/usuarios')

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('el dueño ve las tres pestañas', () => {
    mostrar(dueno, '/configuracion/negocio')

    const pestanas = within(menuConfiguracion()).getAllByRole('link')
    expect(pestanas.map((p) => p.textContent)).toEqual(['Datos del negocio', 'Tipos, marcas y motos', 'Usuarios'])
  })

  it('el vendedor solo ve Datos del negocio', () => {
    mostrar(vendedor, '/configuracion/negocio')

    const pestanas = within(menuConfiguracion()).getAllByRole('link')
    expect(pestanas.map((p) => p.textContent)).toEqual(['Datos del negocio'])
  })

  it('el dueño entra a Usuarios', () => {
    mostrar(dueno, '/configuracion/usuarios')

    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument()
  })

  it.each(['/configuracion/usuarios', '/configuracion/catalogo'])(
    'el vendedor que escribe la dirección %s ve que no tiene permiso',
    (ruta) => {
      mostrar(vendedor, ruta)

      expect(screen.getByRole('heading', { name: 'No tienes permiso para ver esta pantalla' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Volver al inicio' })).toBeInTheDocument()
    },
  )
})

describe('direcciones inexistentes', () => {
  it('avisa que no encontró la pantalla', () => {
    mostrar(dueno, '/no-existe')

    expect(screen.getByRole('heading', { name: 'No encontramos esa pantalla' })).toBeInTheDocument()
  })
})
