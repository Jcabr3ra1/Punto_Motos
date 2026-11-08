import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Package } from 'lucide-react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearClienteDeConsultas } from '../api/consultas'
import { BarraDeFiltros, BotonDeFiltro } from './BarraDeFiltros'
import { EncabezadoDePantalla } from './EncabezadoDePantalla'
import { EstadoVacio } from './EstadoVacio'
import { Ficha } from './Ficha'
import { FranjaDeIndicadores } from './FranjaDeIndicadores'

afterEach(() => {
  vi.unstubAllGlobals()
  document.getElementById('contenido')?.remove()
})

describe('encabezado de pantalla', () => {
  it('tiene un h2 con el título y la placa es decorativa', () => {
    const { container } = render(
      <EncabezadoDePantalla icono={Package} titulo="Productos" descripcion="Existencias y precios" acciones={<button>Nuevo</button>} />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Productos' })).toBeInTheDocument()
    expect(screen.getByText('Existencias y precios')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeInTheDocument()
    expect(container.querySelector('.encabezado-pantalla__placa')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('franja de indicadores', () => {
  it('muestra cada rótulo con su valor', () => {
    render(
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Productos activos', valor: '412' },
          { rotulo: 'Insumos de taller', valor: '38' },
        ]}
      />,
    )

    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual(['Productos activos', 'Insumos de taller'])
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['412', '38'])
  })

  it('un indicador con error muestra una raya y no tumba los demás', () => {
    render(
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Debo', valor: '$ 1', error: true },
          { rotulo: 'Me deben', valor: '$ 2' },
        ]}
      />,
    )

    const [conError, bien] = screen.getAllByRole('definition')
    expect(conError).toHaveTextContent('—')
    expect(conError.querySelector('[title="No se pudo cargar"]')).not.toBeNull()
    expect(bien).toHaveTextContent('$ 2')
  })

  it('mientras carga, el valor está ocupado', () => {
    render(<FranjaDeIndicadores indicadores={[{ rotulo: 'Ventas', valor: '3', cargando: true }]} />)

    expect(screen.getByRole('definition')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('definition')).not.toHaveTextContent('3')
  })
})

function FiltrosDePrueba({ resultados }: { resultados: number }) {
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(false)
  return (
    <>
      <input aria-label="Otro campo" />
      <BarraDeFiltros
        busqueda={{ valor: texto, onCambiar: setTexto, placeholder: 'Código o nombre', etiqueta: 'Buscar productos' }}
        resultados={resultados}
      >
        <BotonDeFiltro activo={activo} onClick={() => setActivo(!activo)}>
          Insumos
        </BotonDeFiltro>
      </BarraDeFiltros>
    </>
  )
}

describe('barra de filtros', () => {
  it('el botón de filtro activo tiene aria-pressed', async () => {
    render(<FiltrosDePrueba resultados={3} />)
    const boton = screen.getByRole('button', { name: 'Insumos' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')

    await userEvent.setup().click(boton)

    expect(boton).toHaveAttribute('aria-pressed', 'true')
  })

  it('dice cuántos resultados hay', () => {
    const { rerender } = render(<FiltrosDePrueba resultados={12} />)
    expect(screen.getByText('12 resultados')).toBeInTheDocument()

    rerender(<FiltrosDePrueba resultados={1} />)
    expect(screen.getByText('1 resultado')).toBeInTheDocument()

    rerender(<FiltrosDePrueba resultados={1500} />)
    expect(screen.getByText('1.500 resultados')).toBeInTheDocument()
  })

  it('la tecla / enfoca la búsqueda, pero no mientras se escribe en otro campo', async () => {
    render(<FiltrosDePrueba resultados={0} />)
    const u = userEvent.setup()
    const busqueda = screen.getByRole('searchbox', { name: 'Buscar productos' })

    await u.click(screen.getByRole('button', { name: 'Insumos' }))
    await u.keyboard('/')
    expect(busqueda).toHaveFocus()
    expect(busqueda).toHaveValue('')

    await u.click(screen.getByRole('textbox', { name: 'Otro campo' }))
    await u.keyboard('/')
    expect(screen.getByRole('textbox', { name: 'Otro campo' })).toHaveValue('/')
    expect(busqueda).not.toHaveFocus()
  })
})

function conConsultas(contenido: React.ReactNode) {
  return <QueryClientProvider client={crearClienteDeConsultas()}>{contenido}</QueryClientProvider>
}

describe('ficha', () => {
  it('se cierra con Esc', async () => {
    const onCerrar = vi.fn()
    render(
      conConsultas(
        <Ficha titulo="Pastillas de freno" modulo="Productos" onCerrar={onCerrar} acciones={<button>Editar</button>}>
          <p>Detalle</p>
        </Ficha>,
      ),
    )
    const ficha = screen.getByRole('complementary', { name: 'Pastillas de freno' })
    expect(ficha).toHaveTextContent('Detalle')

    screen.getByRole('button', { name: 'Editar' }).focus()
    await userEvent.setup().keyboard('{Escape}')

    expect(onCerrar).toHaveBeenCalledOnce()
  })

  it('el botón Cerrar también la cierra', async () => {
    const onCerrar = vi.fn()
    render(conConsultas(<Ficha titulo="Venta #12" modulo="Ventas" onCerrar={onCerrar}>x</Ficha>))

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar la ficha' }))

    expect(onCerrar).toHaveBeenCalledOnce()
  })

  it('con el área angosta, la ficha se abre como panel lateral', () => {
    const contenido = Object.assign(document.createElement('main'), { id: 'contenido' })
    document.body.append(contenido)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        alCambiar: ResizeObserverCallback
        constructor(alCambiar: ResizeObserverCallback) {
          this.alCambiar = alCambiar
        }
        observe(elemento: Element) {
          this.alCambiar([{ contentRect: { width: 1000 }, target: elemento } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
        }
        disconnect() {}
        unobserve() {}
      },
    )

    render(conConsultas(<Ficha titulo="Pastillas de freno" modulo="Productos" onCerrar={() => {}}>Detalle</Ficha>))

    expect(screen.getByRole('dialog', { name: 'Pastillas de freno' })).toHaveTextContent('Detalle')
  })
})

describe('estado vacío', () => {
  it('muestra el mensaje y la acción', () => {
    const { container } = render(<EstadoVacio icono={Package} mensaje="Todavía no hay productos." accion={<button>Nuevo producto</button>} />)

    expect(screen.getByText('Todavía no hay productos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
