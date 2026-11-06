import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DialogoDeConfirmacion } from './DialogoDeConfirmacion'
import { PanelLateral } from './PanelLateral'
import { VistaPrevia } from './VistaPrevia'

function PantallaDePrueba({ onGuardar = () => {}, ancho }: { onGuardar?: () => void; ancho?: 'normal' | 'ancho' }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}>
        Nuevo
      </button>
      <table>
        <tbody>
          <tr>
            <td>La lista sigue aquí</td>
          </tr>
        </tbody>
      </table>
      {abierto && (
        <PanelLateral titulo="Nuevo proveedor" modulo="Compras" descripcion="Datos para pedirle mercancía" ancho={ancho} onCerrar={() => setAbierto(false)}>
          <form
            onSubmit={(evento) => {
              evento.preventDefault()
              onGuardar()
            }}
          >
            <label>
              Nombre
              <input name="nombre" />
            </label>
            <label>
              Teléfono
              <input name="telefono" />
            </label>
            <div className="acciones">
              <button type="submit">Guardar</button>
              <button type="button" onClick={() => setAbierto(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </PanelLateral>
      )}
    </>
  )
}

async function abrir(props: Parameters<typeof PantallaDePrueba>[0] = {}) {
  const u = userEvent.setup()
  render(<PantallaDePrueba {...props} />)
  await u.click(screen.getByRole('button', { name: 'Nuevo' }))
  return u
}

const panel = () => screen.queryByRole('dialog', { name: 'Nuevo proveedor' })

describe('panel lateral', () => {
  it('se abre con su título y módulo, y la lista sigue detrás', async () => {
    await abrir()

    expect(panel()).toHaveAttribute('aria-modal', 'true')
    expect(panel()).toHaveTextContent('Compras')
    expect(panel()).toHaveTextContent('Datos para pedirle mercancía')
    expect(screen.getByText('La lista sigue aquí')).toBeInTheDocument()
  })

  it('al abrir, el foco va al primer campo', async () => {
    await abrir()

    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveFocus()
  })

  it('al cerrar, el foco vuelve al botón que lo abrió', async () => {
    const u = await abrir()

    await u.keyboard('{Escape}')

    expect(panel()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo' })).toHaveFocus()
  })

  it('Tab no sale del panel', async () => {
    const u = await abrir()

    // Nombre → Teléfono → Guardar → Cancelar → Cerrar (×) → vuelve a Nombre.
    await u.tab()
    await u.tab()
    await u.tab()
    await u.tab()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    await u.tab()
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveFocus()

    await u.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus()
  })

  it('Esc sin cambios cierra de inmediato', async () => {
    const u = await abrir()

    await u.keyboard('{Escape}')

    expect(panel()).not.toBeInTheDocument()
  })

  it('Esc con cambios pregunta antes de descartarlos', async () => {
    const u = await abrir()
    await u.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Motopartes')

    await u.keyboard('{Escape}')
    const pregunta = screen.getByRole('alertdialog', { name: '¿Descartar los cambios?' })
    expect(pregunta).toBeInTheDocument()

    // Un segundo Esc cierra solo la pregunta: el panel y lo escrito siguen ahí.
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(panel()).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Motopartes')

    await u.keyboard('{Escape}')
    await u.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(panel()).not.toBeInTheDocument()
  })

  it('el botón cerrar y el clic fuera también preguntan si hay cambios', async () => {
    const u = await abrir()
    await u.type(screen.getByRole('textbox', { name: 'Nombre' }), 'x')

    await u.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('alertdialog', { name: '¿Descartar los cambios?' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Seguir editando' }))

    await u.click(document.querySelector('.panel-lateral__velo')!)
    expect(screen.getByRole('alertdialog', { name: '¿Descartar los cambios?' })).toBeInTheDocument()
  })

  it('Ctrl+Enter envía el formulario una vez', async () => {
    const onGuardar = vi.fn()
    const u = await abrir({ onGuardar })

    await u.keyboard('{Control>}{Enter}{/Control}')

    expect(onGuardar).toHaveBeenCalledTimes(1)
  })

  it('el panel ancho se distingue del normal', async () => {
    await abrir({ ancho: 'ancho' })

    expect(panel()).toHaveClass('panel-lateral--ancho')
  })
})

describe('diálogo de confirmación', () => {
  it('empieza con el foco en Cancelar y Esc cancela', async () => {
    const onCancelar = vi.fn()
    const onConfirmar = vi.fn()
    const u = userEvent.setup()
    render(
      <DialogoDeConfirmacion titulo="¿Eliminar «Bujía»?" accion="Sí, eliminar" peligro onConfirmar={onConfirmar} onCancelar={onCancelar}>
        Su código quedará libre.
      </DialogoDeConfirmacion>,
    )

    const dialogo = screen.getByRole('alertdialog', { name: '¿Eliminar «Bujía»?' })
    expect(dialogo).toHaveAccessibleDescription('Su código quedará libre.')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Sí, eliminar' })).toHaveClass('boton--peligro')

    await u.keyboard('{Escape}')
    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it('mientras trabaja no se puede confirmar dos veces', () => {
    render(<DialogoDeConfirmacion titulo="¿Anular?" accion="Anulando…" ocupado onConfirmar={() => {}} onCancelar={() => {}} />)

    expect(screen.getByRole('button', { name: 'Anulando…' })).toBeDisabled()
  })
})

describe('vista previa', () => {
  it('muestra el antes y el después', () => {
    render(<VistaPrevia etiqueta="Existencias" antes="12" despues="15" />)

    expect(screen.getByText('Existencias').closest('.vista-previa')).toHaveTextContent('Existencias de 12 a 15')
  })

  it('puede llevar una nota', () => {
    render(<VistaPrevia etiqueta="Diferencia" antes="$ 412.000" despues="$ 410.000" nota="Faltan $ 2.000" />)

    expect(screen.getByText('Faltan $ 2.000')).toBeInTheDocument()
  })
})
