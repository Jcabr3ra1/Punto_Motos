import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ServiceType } from '../../api/types'
import { useDevolverFoco, useFocoAtrapado, useFondoInerte } from '../../components/useFocoAtrapado'
import { formatearPesos } from '../../utilidades/dinero'
import { sinTildes } from '../../utilidades/texto'

interface Props {
  tipos: readonly ServiceType[]
  cargando: boolean
  onElegir: (tipo: ServiceType) => void
  onCerrar: () => void
}

/**
 * Ventana para agregar un servicio del taller a la venta. Crece bien aunque haya muchos servicios: se filtra por
 * código o por nombre, se elige con flechas y Enter (o con un clic) y Esc la cierra sin agregar nada.
 */
export function VentanaDeServicios({ tipos, cargando, onElegir, onCerrar }: Props) {
  const ventana = useRef<HTMLDivElement>(null)
  const id = useId()
  const idTitulo = `${id}-titulo`
  const idLista = `${id}-lista`
  const idOpcion = (indice: number) => `${id}-opcion-${indice}`
  const [texto, setTexto] = useState('')
  const [marcado, setMarcado] = useState(0)
  useFondoInerte()
  useDevolverFoco()
  useFocoAtrapado(ventana, true)

  const limpio = sinTildes(texto.trim())
  const visibles = limpio ? tipos.filter((t) => String(t.code).startsWith(limpio) || sinTildes(t.name).includes(limpio)) : tipos
  const activo = visibles.length === 0 ? -1 : Math.min(marcado, visibles.length - 1)

  // Con muchos servicios la lista se desplaza: la opción marcada con las flechas no debe quedar oculta.
  useEffect(() => {
    if (activo >= 0) document.getElementById(`${id}-opcion-${activo}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activo, id])

  function alPulsarTecla(evento: KeyboardEvent<HTMLInputElement>) {
    switch (evento.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        evento.preventDefault()
        if (visibles.length === 0) break
        const paso = evento.key === 'ArrowDown' ? 1 : -1
        setMarcado((activo + paso + visibles.length) % visibles.length)
        break
      }
      case 'Enter':
        // Ctrl+Enter es de Vender (cobrar); aquí no debe agregar ni enviar el formulario.
        evento.preventDefault()
        if (!evento.ctrlKey && !evento.metaKey && activo >= 0) onElegir(visibles[activo])
        break
    }
  }

  return createPortal(
    <div className="dialogo__velo">
      <div
        ref={ventana}
        className="dialogo ventana-de-servicios"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape') return
          evento.preventDefault()
          evento.stopPropagation()
          onCerrar()
        }}
      >
        <div className="dialogo__cabecera">
          <h2 id={idTitulo} className="dialogo__titulo">
            Agregar servicio
          </h2>
        </div>
        <div className="ventana-de-servicios__cuerpo">
          <label htmlFor={`${id}-entrada`} className="buscador__etiqueta">
            Buscar servicio
          </label>
          <input
            id={`${id}-entrada`}
            type="search"
            role="combobox"
            className="buscador__entrada"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setMarcado(0)
            }}
            onKeyDown={alPulsarTecla}
            placeholder="Código o nombre"
            aria-expanded={visibles.length > 0}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={activo >= 0 ? idOpcion(activo) : undefined}
            autoComplete="off"
            autoFocus
          />
          {cargando ? (
            <p className="ventana-de-servicios__estado">Cargando servicios…</p>
          ) : visibles.length === 0 ? (
            <p className="ventana-de-servicios__estado">
              {limpio ? `No hay servicios con «${texto.trim()}».` : 'Todavía no hay servicios del taller.'}
            </p>
          ) : null}
          <ul id={idLista} role="listbox" aria-label="Servicios del taller" className="buscador__lista ventana-de-servicios__lista" hidden={visibles.length === 0}>
            {visibles.map((tipo, indice) => (
              <li
                key={tipo.id}
                id={idOpcion(indice)}
                role="option"
                aria-selected={indice === activo}
                className="buscador__opcion ventana-de-servicios__opcion"
                // mousedown (y no click) evita que el campo pierda el foco antes de elegir.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onElegir(tipo)
                }}
                onMouseEnter={() => setMarcado(indice)}
              >
                <span className="tabla__codigo">{tipo.code}</span>
                <span className="buscador__nombre">
                  {tipo.name}
                  <span className="tabla__detalle">Mano de obra</span>
                </span>
                <span className="buscador__precio">{formatearPesos(tipo.suggested_price)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="dialogo__acciones">
          <button type="button" className="boton boton--secundario boton--auto" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
