import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, useState, type KeyboardEvent } from 'react'
import { claves } from '../../api/consultas'
import type { Customer } from '../../api/types'
import { buscarClientes } from '../../api/ventas'
import { Campo } from '../../components/Campo'
import { useDebounce } from '../../hooks/useDebounce'

export type ClienteElegido =
  | { tipo: 'existente'; cliente: Customer }
  | { tipo: 'nuevo'; nombre: string; telefono: string }

interface Props {
  valor: ClienteElegido | null
  onCambiar: (cliente: ClienteElegido | null) => void
  errores?: string[]
}

// El cliente es obligatorio. Se sugiere mientras se escribe (`/customers?q=&page_size=8`); como el nombre
// puede repetirse, cada sugerencia muestra el teléfono. Si no está, se crea con la venta.
export function SelectorDeCliente({ valor, onCambiar, errores = [] }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [marcado, setMarcado] = useState(0)
  const consultado = useDebounce(texto.trim(), 250)
  const sugerencias = useQuery({
    queryKey: [...claves.clientes, consultado],
    queryFn: ({ signal }) => buscarClientes(consultado, signal),
    enabled: consultado.length >= 2,
    placeholderData: keepPreviousData,
  })

  if (valor?.tipo === 'existente') {
    return (
      <div className="campo">
        <span className="filtro-de-producto__etiqueta">Cliente</span>
        <p className="filtro-de-producto">
          <span>
            <strong>{valor.cliente.name}</strong>
            {valor.cliente.phone && <span className="tabla__detalle">{valor.cliente.phone}</span>}
          </span>
          <button type="button" className="boton-enlace" onClick={() => onCambiar(null)}>
            Cambiar
          </button>
        </p>
      </div>
    )
  }

  if (valor?.tipo === 'nuevo') {
    return (
      <fieldset className="conjunto">
        <legend>Cliente nuevo</legend>
        <div className="campos-en-fila">
          <Campo
            etiqueta="Nombre del cliente"
            value={valor.nombre}
            onChange={(e) => onCambiar({ ...valor, nombre: e.target.value })}
            errores={errores}
            maxLength={80}
            autoComplete="off"
            required
          />
          <Campo
            etiqueta="Teléfono"
            type="tel"
            value={valor.telefono}
            onChange={(e) => onCambiar({ ...valor, telefono: e.target.value })}
            ayuda="Opcional. Ayuda a distinguir clientes con el mismo nombre."
            autoComplete="off"
          />
        </div>
        <button type="button" className="boton-enlace" onClick={() => onCambiar(null)}>
          Buscar un cliente existente
        </button>
      </fieldset>
    )
  }

  const visibles = texto.trim().length >= 2 ? (sugerencias.data?.results ?? []) : []
  // La última opción siempre es crear uno nuevo con lo escrito.
  const total = texto.trim().length >= 2 ? visibles.length + 1 : 0
  const activo = Math.min(marcado, Math.max(0, total - 1))

  function elegir(indice: number) {
    if (indice < visibles.length) onCambiar({ tipo: 'existente', cliente: visibles[indice] })
    else onCambiar({ tipo: 'nuevo', nombre: texto.trim(), telefono: '' })
    setTexto('')
    setMarcado(0)
  }

  function alPulsarTecla(evento: KeyboardEvent<HTMLInputElement>) {
    if (total === 0) return
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setMarcado((activo + 1) % total)
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setMarcado((activo - 1 + total) % total)
    } else if (evento.key === 'Enter') {
      evento.preventDefault()
      elegir(activo)
    }
  }

  return (
    <div className="campo buscador">
      <label htmlFor={`${id}-cliente`}>Cliente</label>
      <input
        id={`${id}-cliente`}
        type="search"
        role="combobox"
        className="buscador__entrada buscador__entrada--compacta"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setMarcado(0)
        }}
        onKeyDown={alPulsarTecla}
        placeholder="Nombre o teléfono"
        aria-expanded={total > 0}
        aria-controls={`${id}-lista`}
        aria-activedescendant={total > 0 ? `${id}-opcion-${activo}` : undefined}
        aria-invalid={errores.length > 0 || undefined}
        aria-describedby={errores.length ? `${id}-errores` : undefined}
        autoComplete="off"
      />
      <ul id={`${id}-lista`} role="listbox" aria-label="Clientes" className="buscador__lista" hidden={total === 0}>
        {/* Sin texto suficiente no hay opciones: una oculta y «seleccionada» confundiría a los lectores de pantalla. */}
        {total > 0 && (
          <>
            {visibles.map((cliente, indice) => (
              <li
                key={cliente.id}
                id={`${id}-opcion-${indice}`}
                role="option"
                aria-selected={indice === activo}
                className="buscador__opcion buscador__opcion--simple"
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(indice)
                }}
              >
                <span>{cliente.name}</span>
                <span className="tabla__detalle">{cliente.phone || 'Sin teléfono'}</span>
              </li>
            ))}
            <li
              id={`${id}-opcion-${visibles.length}`}
              role="option"
              aria-selected={activo === visibles.length}
              className="buscador__opcion buscador__opcion--simple"
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(visibles.length)
              }}
            >
              <span>
                Crear cliente nuevo: <strong>«{texto.trim()}»</strong>
              </span>
            </li>
          </>
        )}
      </ul>
      {errores.length > 0 && (
        <ul id={`${id}-errores`} className="campo__errores">
          {errores.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
