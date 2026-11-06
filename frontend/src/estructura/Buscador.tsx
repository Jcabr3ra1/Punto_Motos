import { CornerDownLeft, Search } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useUsuario } from '../auth/useUsuario'
import { buscarPantallas } from '../navegacion/buscar'

interface Props {
  conteoAbierto: boolean
  /** `eligio`: se abrió una pantalla; si no, se cerró sin elegir. */
  onCerrar: (eligio: boolean) => void
}

// Buscador de pantallas (Ctrl+K): escribir parte del nombre, moverse con las flechas y abrir con Enter.
export function Buscador({ conteoAbierto, onCerrar }: Props) {
  const usuario = useUsuario()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [activa, setActiva] = useState(0)
  const resultados = useMemo(() => buscarPantallas(texto, usuario.role, conteoAbierto), [texto, usuario.role, conteoAbierto])
  const idLista = useId()
  const idOpcion = (indice: number) => `${idLista}-opcion-${indice}`

  function abrir(indice: number) {
    const elegido = resultados[indice]
    if (!elegido) return
    navegar(elegido.destino.ruta)
    onCerrar(true)
  }

  function alPulsar(evento: KeyboardEvent) {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (resultados.length === 0) return
      const paso = evento.key === 'ArrowDown' ? 1 : -1
      const siguiente = (activa + paso + resultados.length) % resultados.length
      setActiva(siguiente)
      document.getElementById(idOpcion(siguiente))?.scrollIntoView?.({ block: 'nearest' })
    } else if (evento.key === 'Enter') {
      evento.preventDefault()
      abrir(activa)
    } else if (evento.key === 'Escape') {
      evento.preventDefault()
      onCerrar(false)
    } else if (evento.key === 'Tab') {
      // El campo es el único control: el foco no sale del buscador.
      evento.preventDefault()
    }
  }

  return createPortal(
    <div className="buscador-pantallas__velo" onMouseDown={(evento) => evento.target === evento.currentTarget && onCerrar(false)}>
      <div className="buscador-pantallas" role="dialog" aria-modal="true" aria-label="Buscar pantalla">
        <div className="buscador-pantallas__campo">
          <Search aria-hidden="true" size={18} strokeWidth={1.75} />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={resultados.length > 0 ? idOpcion(activa) : undefined}
            aria-label="Pantalla a buscar"
            placeholder="¿A qué pantalla quieres ir?"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value)
              setActiva(0)
            }}
            onKeyDown={alPulsar}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id={idLista} role="listbox" aria-label="Pantallas" className="buscador-pantallas__lista">
          {resultados.map(({ destino, modulo }, indice) => {
            const Icono = destino.icono
            return (
              <li
                key={destino.ruta}
                id={idOpcion(indice)}
                role="option"
                aria-selected={indice === activa}
                className="buscador-pantallas__opcion"
                onMouseMove={() => setActiva(indice)}
                onClick={() => abrir(indice)}
              >
                <span className="buscador-pantallas__icono" aria-hidden="true">
                  <Icono size={16} strokeWidth={1.75} />
                </span>
                <span className="buscador-pantallas__texto">
                  <span className="buscador-pantallas__nombre">
                    {modulo !== destino && <span className="buscador-pantallas__modulo">{modulo.etiqueta} › </span>}
                    {destino.etiqueta}
                  </span>
                  <span className="buscador-pantallas__descripcion">{destino.descripcion}</span>
                </span>
                {indice === activa && <CornerDownLeft className="buscador-pantallas__enter" aria-hidden="true" size={14} />}
              </li>
            )
          })}
        </ul>
        {resultados.length === 0 && <p className="buscador-pantallas__vacio">Ninguna pantalla coincide con «{texto.trim()}».</p>}
        <p className="buscador-pantallas__ayuda" aria-hidden="true">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> moverse
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </p>
      </div>
    </div>,
    document.body,
  )
}
