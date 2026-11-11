import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wrench, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { listarMecanicos, listarTiposDeServicio } from '../../api/taller'
import type { Product, SaleDetail, SaleInput, ServiceType } from '../../api/types'
import { nuevaClaveDeReintento, registrarVenta } from '../../api/ventas'
import { useUsuario } from '../../auth/useUsuario'
import { AvisoDeError } from '../../components/AvisoDeError'
import { BuscadorDeProductos, type OpcionAdicional } from '../../components/BuscadorDeProductos'
import { Campo } from '../../components/Campo'
import { hayVentanaAbierta } from '../../components/useFocoAtrapado'
import { useAtajo } from '../../hooks/useAtajo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos } from '../../utilidades/dinero'
import { useConteoInicial } from '../inventario/useConteoInicial'
import { SelectorDeCliente, type ClienteElegido } from './SelectorDeCliente'
import { VentanaDeServicios } from './VentanaDeServicios'
import { VentanaDeVenta } from './VentanaDeVenta'

/**
 * Cómo paga el cliente. El backend solo distingue efectivo y transferencia: la transferencia bancaria y Nequi
 * se envían las dos como `transfer`, y el medio exacto queda escrito en las notas de la venta (sale en el recibo).
 */
type Medio = 'efectivo' | 'transferencia' | 'nequi' | 'mixto'
type Canal = 'transferencia' | 'nequi'

const MEDIOS: readonly { valor: Medio; texto: string }[] = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencia', texto: 'Transferencia bancaria' },
  { valor: 'nequi', texto: 'Nequi' },
  { valor: 'mixto', texto: 'Mixto' },
]

/** Billetes rápidos para lo que entrega el cliente. */
const BILLETES = [50_000, 100_000, 200_000] as const

const NOMBRE_DEL_CANAL: Record<Canal, string> = { transferencia: 'transferencia bancaria', nequi: 'Nequi' }

/** Servicio del taller en la venta: se cobra la mano de obra; los repuestos van como productos. */
interface LineaDeServicio {
  clave: string
  tipo: ServiceType
  /** Id del mecánico; obligatorio. */
  mecanico: string
  detalles: string
  /** Mano de obra; solo el dueño puede cambiarla. */
  precio: number
}

interface Linea {
  producto: Product
  cantidad: number
  /** Precio cobrado; solo el dueño puede cambiarlo. */
  precio: number
}

// Venta de mostrador, pagada completa (no hay ventas a crédito). El carrito vive en la ventana: el backend
// no guarda borradores. Al cobrar se envía una `idempotency_key` que se reutiliza en los reintentos de esta
// misma venta, para que un doble clic o un fallo de red no la registre dos veces.
export function Vender() {
  const esDueno = useUsuario().role === 'owner'
  const clienteDeConsultas = useQueryClient()
  const caja = useCajaActual()
  const conteo = useConteoInicial()

  const [lineas, setLineas] = useState<Linea[]>([])
  const [servicios, setServicios] = useState<LineaDeServicio[]>([])
  const tipos = useQuery({ queryKey: claves.tiposDeServicio(false), queryFn: ({ signal }) => listarTiposDeServicio(false, signal) })
  const mecanicos = useQuery({ queryKey: claves.mecanicos(false), queryFn: ({ signal }) => listarMecanicos(false, signal) })
  const [cliente, setCliente] = useState<ClienteElegido | null>(null)
  const [medio, setMedio] = useState<Medio>('efectivo')
  // En el pago mixto: por dónde llega la parte que no es efectivo.
  const [canal, setCanal] = useState<Canal>('transferencia')
  const [transferencia, setTransferencia] = useState('')
  const [efectivoRecibido, setEfectivoRecibido] = useState('')
  const [notas, setNotas] = useState('')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [clave, setClave] = useState(nuevaClaveDeReintento)
  const [vendida, setVendida] = useState<{ venta: SaleDetail; vuelto: number } | null>(null)
  const [eligiendoServicio, setEligiendoServicio] = useState(false)
  const enfocarBuscador = useRef(false)

  const total =
    lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0) + servicios.reduce((suma, s) => suma + s.precio, 0)
  const enTransferencia =
    medio === 'efectivo' ? 0 : medio === 'mixto' ? Number(transferencia) || 0 : total
  const enEfectivo = Math.max(0, total - enTransferencia)
  const recibido = efectivoRecibido === '' ? enEfectivo : Number(efectivoRecibido) || 0
  const vuelto = Math.max(0, recibido - enEfectivo)
  const faltaEfectivo = Math.max(0, enEfectivo - recibido)
  const transferenciaDeMas = enTransferencia > total

  const cajaCerrada = caja.data?.is_open === false
  const conteoAbierto = conteo.data?.is_open === true

  const cobrar = useMutation({
    mutationFn: () => {
      const pagos: SaleInput['payments'] = []
      if (enEfectivo > 0) pagos.push({ method: 'cash', amount: enEfectivo })
      if (enTransferencia > 0) pagos.push({ method: 'transfer', amount: enTransferencia })
      return registrarVenta({
        idempotency_key: clave,
        ...(cliente?.tipo === 'existente' ? { customer: cliente.cliente.id } : {}),
        // Un cliente nuevo que quedó en blanco es lo mismo que no tener cliente.
        ...(cliente?.tipo === 'nuevo' && (cliente.nombre.trim() || cliente.telefono.trim())
          ? { new_customer: { name: cliente.nombre, ...(cliente.telefono.trim() ? { phone: cliente.telefono } : {}) } }
          : {}),
        ...(lineas.length > 0
          ? {
              items: lineas.map((l) => ({
                product: l.producto.id,
                quantity: l.cantidad,
                ...(esDueno && l.precio !== l.producto.sale_price ? { unit_price: l.precio } : {}),
              })),
            }
          : {}),
        ...(servicios.length > 0
          ? {
              services: servicios.map((s) => ({
                service_type: s.tipo.id,
                mechanic: Number(s.mecanico),
                ...(s.detalles.trim() ? { details: s.detalles } : {}),
                ...(esDueno && s.precio !== s.tipo.suggested_price ? { labor_price: s.precio } : {}),
              })),
            }
          : {}),
        payments: pagos,
        notes: [notaDelMedio(), notas.trim()].filter(Boolean).join(' · '),
      })
    },
    onSuccess: async (venta) => {
      setVendida({ venta, vuelto })
      await Promise.all(
        [claves.ventas, claves.caja, claves.productos, claves.movimientos, claves.clientes, ['buscador'], ['producto']].map((queryKey) =>
          clienteDeConsultas.invalidateQueries({ queryKey }),
        ),
      )
    },
    onError: (fallo) => {
      if (isApiError(fallo) && (fallo.code === 'cash_session_closed' || fallo.code === 'initial_count_open')) {
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
        void clienteDeConsultas.invalidateQueries({ queryKey: ['inventario'] })
      }
    },
  })
  const error = cobrar.isError ? desglosarError(cobrar.error) : null

  /** Deja constancia del medio exacto, que el backend no distingue (bancaria o Nequi). */
  function notaDelMedio() {
    if (medio === 'transferencia' || medio === 'nequi') return `Pago por ${NOMBRE_DEL_CANAL[medio]}`
    if (medio === 'mixto' && enTransferencia > 0) return `Parte por ${NOMBRE_DEL_CANAL[canal]}: ${formatearPesos(enTransferencia)}`
    return ''
  }

  function nuevaVenta() {
    setLineas([])
    setServicios([])
    setCliente(null)
    setMedio('efectivo')
    setCanal('transferencia')
    setTransferencia('')
    setEfectivoRecibido('')
    setNotas('')
    setMensaje(null)
    setVendida(null)
    // Clave nueva solo para una venta nueva.
    setClave(nuevaClaveDeReintento())
    cobrar.reset()
  }

  function agregarServicio(tipo: ServiceType) {
    setMensaje(null)
    // Se puede repetir el mismo tipo (dos cambios de aceite): cada uno es una línea.
    setServicios((actuales) => [
      ...actuales,
      { clave: nuevaClaveDeReintento(), tipo, mecanico: '', detalles: '', precio: tipo.suggested_price },
    ])
  }

  function cambiarServicio(clave: string, cambios: Partial<LineaDeServicio>) {
    setServicios((actuales) => actuales.map((s) => (s.clave === clave ? { ...s, ...cambios } : s)))
  }

  /** Si lo escrito son solo números, se ofrecen los servicios con ese código (`/catalog/search` es solo de productos). */
  function serviciosPorCodigo(texto: string): OpcionAdicional[] {
    if (!/^\d+$/.test(texto)) return []
    return (tipos.data ?? [])
      .filter((t) => String(t.code).startsWith(texto))
      .slice(0, 5)
      .map((t) => ({
        clave: `servicio-${t.id}`,
        contenido: (
          <>
            <span className="tabla__codigo">{t.code}</span>
            <span className="buscador__nombre">
              Servicio: {t.name}
              <span className="tabla__detalle">Mano de obra</span>
            </span>
            <span className="buscador__precio">{formatearPesos(t.suggested_price)}</span>
          </>
        ),
        alElegir: () => agregarServicio(t),
      }))
  }

  function agregar(producto: Product) {
    const existente = lineas.find((l) => l.producto.id === producto.id)
    if (existente && existente.cantidad >= producto.stock) {
      setMensaje(`Ya agregaste todas las unidades disponibles de «${producto.name}» (${producto.stock}).`)
      return
    }
    setMensaje(null)
    setLineas((actuales) =>
      existente
        ? actuales.map((l) => (l.producto.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
        : [...actuales, { producto, cantidad: 1, precio: producto.sale_price }],
    )
  }

  function cambiar(indice: number, cambios: Partial<Linea>) {
    setLineas((actuales) => actuales.map((l, i) => (i === indice ? { ...l, ...cambios } : l)))
  }

  function alCobrar(evento: FormEvent) {
    evento.preventDefault()
    // Enter en un campo también envía el formulario: se respeta el mismo bloqueo que el botón.
    if (!puedeCobrar) return
    cobrar.mutate()
  }

  const bloqueada = cajaCerrada || conteoAbierto
  const faltaMecanico = servicios.some((s) => s.mecanico === '')
  const hayAlgo = lineas.length > 0 || servicios.length > 0
  const puedeCobrar =
    !bloqueada &&
    hayAlgo &&
    !faltaMecanico &&
    faltaEfectivo === 0 &&
    !transferenciaDeMas &&
    !cobrar.isPending

  // Ctrl+Enter cobra desde cualquier campo; F2 vuelve al buscador, como en una caja registradora.
  useAtajo('enter', () => {
    if (puedeCobrar) cobrar.mutate()
  }, !vendida)
  useEffect(() => {
    if (vendida) return
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== 'F2' || hayVentanaAbierta()) return
      evento.preventDefault()
      document.querySelector<HTMLInputElement>('.venta__buscador input')?.focus()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [vendida])

  // Al elegir un servicio en su ventana, el foco sigue en el buscador para agregar lo siguiente. Corre después de que
  // la ventana devuelva el foco al botón que la abrió; Esc o Cancelar sí lo dejan en ese botón.
  useEffect(() => {
    if (eligiendoServicio || !enfocarBuscador.current) return
    enfocarBuscador.current = false
    document.querySelector<HTMLInputElement>('.venta__buscador input')?.focus()
  }, [eligiendoServicio])

  // Al cerrar la ventana de la venta registrada, el foco vuelve al buscador para atender al siguiente cliente.
  const habiaVenta = useRef(false)
  useEffect(() => {
    if (habiaVenta.current && !vendida) document.querySelector<HTMLInputElement>('.venta__buscador input')?.focus()
    habiaVenta.current = vendida !== null
  }, [vendida])

  const unidades = lineas.reduce((suma, l) => suma + l.cantidad, 0)
  const resumen = [
    unidades === 1 ? '1 unidad' : `${unidades} unidades`,
    ...(servicios.length > 0 ? [servicios.length === 1 ? '1 servicio' : `${servicios.length} servicios`] : []),
  ].join(' · ')

  return (
    <form onSubmit={alCobrar} noValidate className="venta">
      <div className="venta__trabajo">
        {cajaCerrada && (
          <p role="status" className="aviso aviso--advertencia">
            La caja está cerrada: no se puede vender.{' '}
            {esDueno ? <Link to="/caja/actual">Abrir la caja</Link> : 'Pídele al dueño que la abra.'}
          </p>
        )}
        {conteoAbierto && (
          <p role="status" className="aviso aviso--advertencia">
            El inventario inicial todavía no ha terminado: no se puede vender hasta que el dueño lo termine.
          </p>
        )}
        <AvisoDeError
          mensajes={[...(error?.generales ?? []), ...(error?.campos.items ?? []), ...(error?.campos.services ?? []), ...(error?.campos.payments ?? [])]}
        />
        <div className="venta__entrada">
          <div className="venta__buscador">
            <BuscadorDeProductos
              etiqueta="Buscar producto o servicio"
              onElegir={agregar}
              opcionesAdicionales={serviciosPorCodigo}
              ayuda="Escribe 2 letras para buscar productos, o el código de un servicio (por ejemplo 101). Flechas y Enter para elegir; Esc borra. F2 vuelve aquí."
            />
          </div>
          <div className="venta__servicio">
            {/* Rótulo solo visual, con la misma medida que el del buscador, para que el botón quede a la altura del campo. */}
            <span className="venta__servicio-rotulo" aria-hidden="true">
              Taller
            </span>
            <button type="button" className="boton boton--secundario venta__boton-servicio" onClick={() => setEligiendoServicio(true)}>
              <Wrench aria-hidden="true" size={18} />
              Agregar servicio
            </button>
          </div>
        </div>
        <div role="status" className="venta__mensaje">
          {mensaje}
        </div>

        <section aria-label="Productos de la venta" className="venta__carrito">
          <p className="venta__carrito-titulo">
            <span>Venta en curso</span>
            {hayAlgo && <span>{resumen}</span>}
          </p>
          {!hayAlgo && (
            <div className="venta__vacia">
              <p>Busca un producto o escribe el código de un servicio y pulsa Enter.</p>
              <p className="venta__vacia-atajos">
                <kbd>Enter</kbd> agrega · <kbd>↑</kbd> <kbd>↓</kbd> eligen · <kbd>F2</kbd> buscar · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> cobrar
              </p>
            </div>
          )}
          {lineas.length > 0 && (
            <div className="tabla-contenedor venta__lineas">
              <table className="tabla">
                <caption className="solo-lectores">Productos de la venta</caption>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col" className="tabla__numero">
                      Precio
                    </th>
                    <th scope="col" className="tabla__numero">
                      Subtotal
                    </th>
                    <th scope="col">
                      <span className="solo-lectores">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((linea, indice) => {
                    const errores = [
                      ...(error?.campos[`items.${indice}.product`] ?? []),
                      ...(error?.campos[`items.${indice}.quantity`] ?? []),
                      ...(error?.campos[`items.${indice}.unit_price`] ?? []),
                    ]
                    const nombre = linea.producto.name
                    return (
                      <tr key={linea.producto.id}>
                        <th scope="row">
                          <span className="venta__producto">{nombre}</span>
                          <span className="tabla__detalle">
                            <span className="tabla__codigo">{linea.producto.code}</span> quedan {linea.producto.stock}
                          </span>
                          {errores.length > 0 && (
                            <ul className="campo__errores">
                              {errores.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          )}
                        </th>
                        <td>
                          <span className="paso">
                            <button
                              type="button"
                              className="paso__boton"
                              aria-label={`Una unidad menos de ${nombre}`}
                              disabled={linea.cantidad <= 1}
                              onClick={() => cambiar(indice, { cantidad: linea.cantidad - 1 })}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              className="paso__valor"
                              aria-label={`Cantidad de ${nombre}`}
                              min={1}
                              max={linea.producto.stock}
                              step={1}
                              value={linea.cantidad}
                              onChange={(e) =>
                                cambiar(indice, {
                                  cantidad: Math.min(Math.max(1, Math.trunc(e.target.valueAsNumber) || 1), linea.producto.stock),
                                })
                              }
                            />
                            <button
                              type="button"
                              className="paso__boton"
                              aria-label={`Una unidad más de ${nombre}`}
                              disabled={linea.cantidad >= linea.producto.stock}
                              onClick={() => cambiar(indice, { cantidad: linea.cantidad + 1 })}
                            >
                              +
                            </button>
                          </span>
                        </td>
                        <td className="tabla__numero">
                          {esDueno ? (
                            <>
                              <input
                                type="number"
                                className="celda-numero celda-numero--ancha"
                                aria-label={`Precio de ${nombre}`}
                                min={0}
                                step={1}
                                value={linea.precio}
                                onChange={(e) => cambiar(indice, { precio: Math.max(0, Math.trunc(e.target.valueAsNumber) || 0) })}
                              />
                              {linea.precio !== linea.producto.sale_price && (
                                <span className="tabla__detalle">Catálogo {formatearPesos(linea.producto.sale_price)}</span>
                              )}
                            </>
                          ) : (
                            formatearPesos(linea.precio)
                          )}
                        </td>
                        <td className="tabla__numero venta__subtotal">{formatearPesos(linea.precio * linea.cantidad)}</td>
                        <td className="tabla__acciones">
                          <button
                            type="button"
                            className="venta__quitar"
                            aria-label={`Quitar ${nombre}`}
                            title="Quitar"
                            onClick={() => setLineas((actuales) => actuales.filter((_, i) => i !== indice))}
                          >
                            <X aria-hidden="true" size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {servicios.length > 0 && (
            <section aria-label="Servicios del taller" className="venta__servicios">
              <div className="tabla-contenedor venta__lineas">
                <table className="tabla">
                  <caption className="solo-lectores">Servicios de la venta</caption>
                  <thead>
                    <tr>
                      <th scope="col">Servicio</th>
                      <th scope="col">Mecánico</th>
                      <th scope="col">Qué se hizo</th>
                      <th scope="col" className="tabla__numero">
                        Mano de obra
                      </th>
                      <th scope="col">
                        <span className="solo-lectores">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicios.map((servicio, indice) => {
                      const errores = ['service_type', 'mechanic', 'details', 'labor_price'].flatMap(
                        (campo) => error?.campos[`services.${indice}.${campo}`] ?? [],
                      )
                      const nombre = `${servicio.tipo.name} (${indice + 1})`
                      return (
                        <tr key={servicio.clave} className="venta__fila-servicio">
                          <th scope="row">
                            <span className="venta__etiqueta-taller">Taller</span>
                            <span className="venta__producto">{servicio.tipo.name}</span>
                            <span className="tabla__detalle">
                              <span className="tabla__codigo">{servicio.tipo.code}</span> mano de obra
                            </span>
                            {errores.length > 0 && (
                              <ul className="campo__errores">
                                {errores.map((m) => (
                                  <li key={m}>{m}</li>
                                ))}
                              </ul>
                            )}
                          </th>
                          <td>
                            <select
                              className="celda-selector"
                              aria-label={`Mecánico de ${nombre}`}
                              aria-invalid={servicio.mecanico === '' || undefined}
                              value={servicio.mecanico}
                              onChange={(e) => cambiarServicio(servicio.clave, { mecanico: e.target.value })}
                            >
                              <option value="">Elige el mecánico</option>
                              {(mecanicos.data ?? []).map((m) => (
                                <option key={m.id} value={String(m.id)}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="venta__que-se-hizo">
                              <input
                                className="celda-texto"
                                aria-label={`Qué se hizo en ${nombre}`}
                                value={servicio.detalles}
                                maxLength={120}
                                onChange={(e) => cambiarServicio(servicio.clave, { detalles: e.target.value })}
                                placeholder="Ej. cambio de aceite y filtro, revisión de frenos"
                              />
                              {servicio.detalles.length >= 90 && (
                                <span className="venta__contador" aria-hidden="true">
                                  {servicio.detalles.length}/120
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="tabla__numero venta__subtotal">
                            {esDueno ? (
                              <input
                                type="number"
                                className="celda-numero celda-numero--ancha"
                                aria-label={`Mano de obra de ${nombre}`}
                                min={0}
                                step={1}
                                value={servicio.precio}
                                onChange={(e) => cambiarServicio(servicio.clave, { precio: Math.max(0, Math.trunc(e.target.valueAsNumber) || 0) })}
                              />
                            ) : (
                              formatearPesos(servicio.precio)
                            )}
                          </td>
                          <td className="tabla__acciones">
                            <button
                              type="button"
                              className="venta__quitar"
                              aria-label={`Quitar ${nombre}`}
                              title="Quitar"
                              onClick={() => setServicios((actuales) => actuales.filter((s) => s.clave !== servicio.clave))}
                            >
                              <X aria-hidden="true" size={16} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </div>

      <section aria-label="Cobro" className="venta__cobro">
        <SelectorDeCliente valor={cliente} onCambiar={setCliente} errores={[...(error?.campos.customer ?? []), ...(error?.campos['new_customer.name'] ?? [])]} />
        <dl className="venta__total" aria-label="Total de la venta">
          <dt>Total a cobrar</dt>
          <dd>{formatearPesos(total)}</dd>
          {hayAlgo && <dd className="venta__total-detalle">{resumen}</dd>}
        </dl>
        <fieldset className="conjunto">
          <legend>Medio de pago</legend>
          <div className="selector-de-pago">
            {MEDIOS.map((m) => (
              <label key={m.valor} className="selector-de-pago__opcion">
                <input type="radio" name="medio-de-pago" checked={medio === m.valor} onChange={() => setMedio(m.valor)} />
                {m.texto}
              </label>
            ))}
          </div>
        </fieldset>
        {medio === 'mixto' && (
          <>
            <fieldset className="conjunto">
              <legend>La otra parte llega por</legend>
              <div className="opciones-en-fila">
                {(['transferencia', 'nequi'] as const).map((c) => (
                  <label key={c} className="opcion">
                    <input type="radio" name="canal-mixto" checked={canal === c} onChange={() => setCanal(c)} />
                    {c === 'nequi' ? 'Nequi' : 'Transferencia bancaria'}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* Las dos partes a la vista: al escribir una, la otra se completa con lo que falta del total. */}
            <div className="venta__partes">
              <Campo
                etiqueta="En efectivo"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                // Siempre la cifra real: sin repartir todavía, todo va en efectivo.
                value={String(enEfectivo)}
                onChange={(e) => setTransferencia(String(Math.max(0, total - (Number(e.target.value) || 0))))}
              />
              <Campo
                etiqueta={canal === 'nequi' ? 'Valor por Nequi' : 'Valor por transferencia'}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={transferencia}
                onChange={(e) => setTransferencia(e.target.value)}
                errores={transferenciaDeMas ? ['No puede ser mayor que el total.'] : undefined}
              />
            </div>
          </>
        )}
        {(medio === 'transferencia' || medio === 'nequi') && (
          <p className="venta__efectivo">
            Cobrar <strong>{formatearPesos(total)}</strong> por {NOMBRE_DEL_CANAL[medio]}.
          </p>
        )}
        {(medio === 'efectivo' || medio === 'mixto') && (
          <p className="venta__efectivo">
            Efectivo a cobrar: <strong>{formatearPesos(enEfectivo)}</strong>
          </p>
        )}
        {enEfectivo > 0 && (
          <>
            <Campo
              etiqueta="Efectivo que entrega el cliente"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={efectivoRecibido}
              onChange={(e) => setEfectivoRecibido(e.target.value)}
              errores={faltaEfectivo > 0 ? [`Faltan ${formatearPesos(faltaEfectivo)}.`] : undefined}
              ayuda="Para calcular el vuelto. Vacío: entrega lo justo."
            />
            <div className="venta__billetes" role="group" aria-label="Billetes rápidos">
              <button type="button" onClick={() => setEfectivoRecibido(String(enEfectivo))}>
                Exacto
              </button>
              {BILLETES.map((billete) => (
                <button key={billete} type="button" onClick={() => setEfectivoRecibido(String(billete))}>
                  {formatearPesos(billete)}
                </button>
              ))}
            </div>
          </>
        )}
        {vuelto > 0 && (
          <p role="status" className="venta__vuelto">
            Vuelto: <strong>{formatearPesos(vuelto)}</strong>
          </p>
        )}
        <Campo etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={150} autoComplete="off" />
        <button type="submit" className="boton venta__cobrar" disabled={!puedeCobrar} aria-keyshortcuts="Control+Enter">
          {cobrar.isPending ? 'Cobrando…' : `Cobrar ${formatearPesos(total)}`}
          {!cobrar.isPending && (
            <kbd className="atajo-visible" aria-hidden="true">
              Ctrl+Enter
            </kbd>
          )}
        </button>
        {!bloqueada && faltaMecanico && <p className="campo__ayuda">Elige el mecánico de cada servicio para cobrar.</p>}
        <p className="campo__ayuda">El total es orientativo: el programa confirma los precios al cobrar.</p>
      </section>
      {vendida && <VentanaDeVenta venta={vendida.venta} vuelto={vendida.vuelto} onNuevaVenta={nuevaVenta} />}
      {eligiendoServicio && (
        <VentanaDeServicios
          tipos={tipos.data ?? []}
          cargando={tipos.isPending}
          onElegir={(tipo) => {
            agregarServicio(tipo)
            enfocarBuscador.current = true
            setEligiendoServicio(false)
          }}
          onCerrar={() => setEligiendoServicio(false)}
        />
      )}
    </form>
  )
}
