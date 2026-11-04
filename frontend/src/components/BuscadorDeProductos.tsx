import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { claves } from '../api/consultas'
import { desglosarError } from '../api/errors'
import { buscarProductos } from '../api/productos'
import type { Product } from '../api/types'
import { useDebounce } from '../hooks/useDebounce'
import { formatearPesos } from '../utilidades/dinero'

const MINIMO_DE_CARACTERES = 2

/** Opción que la pantalla agrega antes de los productos (por ejemplo, un servicio por su código). */
export interface OpcionAdicional {
  clave: string
  contenido: ReactNode
  alElegir: () => void
}

interface Props {
  /** Sin esta función solo consulta: muestra los resultados y no se puede elegir ninguno. */
  onElegir?: (producto: Product) => void
  etiqueta?: string
  /** Por defecto los productos sin existencias se muestran pero no se pueden elegir (pantalla de venta). */
  incluirAgotados?: boolean
  /** Opciones propias de la pantalla según lo escrito; van primero y se eligen igual que los productos. */
  opcionesAdicionales?: (texto: string) => OpcionAdicional[]
  ayuda?: string
}

// Buscador de productos (GET /catalog/search). Se maneja con el teclado:
// flechas para moverse, Enter para elegir y Escape para borrar. Tras elegir, el foco se queda en el campo.
export function BuscadorDeProductos({
  onElegir,
  etiqueta = 'Buscar producto',
  incluirAgotados = false,
  opcionesAdicionales,
  ayuda,
}: Props) {
  const seleccionable = onElegir !== undefined
  const sePuedeElegir = (producto: Product) => incluirAgotados || producto.stock > 0
  const id = useId()
  const idLista = `${id}-lista`
  const idOpcion = (indice: number) => `${id}-opcion-${indice}`
  const entrada = useRef<HTMLInputElement>(null)

  const [texto, setTexto] = useState('')
  const [marcado, setMarcado] = useState(0)

  const limpio = texto.trim()
  const buscaYa = limpio.length >= MINIMO_DE_CARACTERES
  const consultado = useDebounce(limpio, 250)
  const consulta = useQuery({
    queryKey: claves.buscador(consultado),
    queryFn: ({ signal }) => buscarProductos(consultado, signal),
    enabled: consultado.length >= MINIMO_DE_CARACTERES,
    // Mientras llegan los resultados nuevos se siguen mostrando los anteriores.
    placeholderData: keepPreviousData,
  })

  const adicionales = seleccionable && limpio ? (opcionesAdicionales?.(limpio) ?? []) : []
  const desplazamiento = adicionales.length
  const resultados = buscaYa ? (consulta.data ?? []) : []
  // Mientras llegan los resultados de lo que se acaba de escribir se siguen viendo los anteriores, pero no se
  // pueden elegir: con un Enter rápido se agregaría el producto de la búsqueda anterior.
  const vigentes = consultado === limpio && !consulta.isPlaceholderData
  // Índices elegibles en la lista completa: primero las opciones adicionales y después los productos.
  const posibles = [
    ...adicionales.map((_, i) => i),
    ...(seleccionable && vigentes ? resultados.flatMap((p, i) => (sePuedeElegir(p) ? [desplazamiento + i] : [])) : []),
  ]
  // Por defecto queda marcado el primero que se puede elegir, para que Enter funcione sin tocar las flechas.
  const activo = posibles.includes(marcado) ? marcado : (posibles[0] ?? -1)
  const abierto = adicionales.length > 0 || (buscaYa && resultados.length > 0)

  function limpiar() {
    setTexto('')
    setMarcado(0)
    entrada.current?.focus()
  }

  function elegirIndice(indice: number) {
    if (indice < desplazamiento) {
      adicionales[indice].alElegir()
      limpiar()
      return
    }
    const producto = resultados[indice - desplazamiento]
    if (!onElegir || !producto || !vigentes || !sePuedeElegir(producto)) return
    onElegir(producto)
    limpiar()
  }

  function moverMarca(paso: 1 | -1) {
    if (posibles.length === 0) return
    const posicion = posibles.indexOf(activo)
    setMarcado(posibles[(posicion + paso + posibles.length) % posibles.length])
  }

  function alPulsarTecla(evento: KeyboardEvent<HTMLInputElement>) {
    switch (evento.key) {
      case 'ArrowDown':
        if (!seleccionable) break
        evento.preventDefault()
        moverMarca(1)
        break
      case 'ArrowUp':
        if (!seleccionable) break
        evento.preventDefault()
        moverMarca(-1)
        break
      case 'Enter':
        if (!seleccionable) break
        evento.preventDefault()
        if (activo >= 0) elegirIndice(activo)
        break
      case 'Escape':
        if (texto) {
          evento.preventDefault()
          setTexto('')
        }
        break
    }
  }

  const sinResultados = buscaYa && consulta.isSuccess && !consulta.isPlaceholderData && resultados.length === 0 && adicionales.length === 0
  const cantidad = adicionales.length + resultados.length

  return (
    <div className="buscador">
      <label htmlFor={`${id}-entrada`} className="buscador__etiqueta">
        {etiqueta}
      </label>
      <input
        ref={entrada}
        id={`${id}-entrada`}
        type="search"
        role="combobox"
        className="buscador__entrada"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={alPulsarTecla}
        placeholder="Código, nombre o moto"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && activo >= 0 ? idOpcion(activo) : undefined}
        autoComplete="off"
        autoFocus
      />
      <p className="campo__ayuda">
        {ayuda ??
          (seleccionable
            ? 'Escribe al menos 2 letras. Usa las flechas y Enter para elegir; Esc borra.'
            : 'Escribe al menos 2 letras. Esc borra.')}
      </p>

      <ul
        id={idLista}
        role="listbox"
        aria-label="Resultados de la búsqueda"
        className={`buscador__lista${seleccionable ? '' : ' buscador__lista--consulta'}`}
        aria-busy={!vigentes || undefined}
        hidden={!abierto}
      >
        {adicionales.map((opcion, indice) => (
          <li
            key={opcion.clave}
            id={idOpcion(indice)}
            role="option"
            aria-selected={indice === activo}
            className="buscador__opcion buscador__opcion--adicional"
            onMouseDown={(e) => {
              e.preventDefault()
              elegirIndice(indice)
            }}
            onMouseEnter={() => setMarcado(indice)}
          >
            {opcion.contenido}
          </li>
        ))}
        {resultados.map((producto, i) => {
          const indice = desplazamiento + i
          const sinExistencias = producto.stock <= 0
          const deshabilitada = !sePuedeElegir(producto)
          return (
            <li
              key={producto.id}
              id={idOpcion(indice)}
              role="option"
              aria-selected={seleccionable ? indice === activo : undefined}
              aria-disabled={deshabilitada || undefined}
              className={`buscador__opcion${vigentes ? '' : ' buscador__opcion--desactualizada'}`}
              // mousedown (y no click) evita que el campo pierda el foco al elegir con el ratón.
              onMouseDown={(e) => {
                e.preventDefault()
                elegirIndice(indice)
              }}
              onMouseEnter={() => !deshabilitada && setMarcado(indice)}
            >
              <span className="tabla__codigo">{producto.code}</span>
              <span className="buscador__nombre">
                {producto.name}
                <span className="tabla__detalle">
                  {[producto.brand?.name, producto.is_universal ? 'Universal' : producto.moto?.name].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="buscador__precio">{formatearPesos(producto.sale_price)}</span>
              <span className={sinExistencias ? 'etiqueta etiqueta--alerta' : 'buscador__existencia'}>
                {sinExistencias ? 'Sin existencias' : `Hay ${producto.stock}`}
              </span>
            </li>
          )
        })}
      </ul>

      <div role="status" className="texto-suave buscador__estado">
        {sinResultados && 'No se encontró ningún producto.'}
        {abierto && buscaYa && !vigentes && 'Buscando…'}
        {abierto && (vigentes || !buscaYa) && !sinResultados && `${cantidad === 1 ? '1 resultado' : `${cantidad} resultados`}`}
      </div>
      {consulta.isError && buscaYa && (
        <p role="alert" className="aviso aviso--error">
          {desglosarError(consulta.error).generales.join(' ')}
        </p>
      )}
    </div>
  )
}
