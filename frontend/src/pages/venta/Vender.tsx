import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
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
import { CampoSelector } from '../../components/CampoSelector'
import { Titulo } from '../../components/Titulo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos } from '../../utilidades/dinero'
import { useConteoInicial } from '../inventario/useConteoInicial'
import { Recibo } from './Recibo'
import { SelectorDeCliente, type ClienteElegido } from './SelectorDeCliente'

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

  if (vendida) {
    return (
      <>
        <Titulo nivel={2}>Venta registrada</Titulo>
        <p role="status" className="aviso aviso--exito">
          Venta n.º {vendida.venta.number} registrada por {formatearPesos(vendida.venta.total)}.
          {vendida.vuelto > 0 && ` Vuelto: ${formatearPesos(vendida.vuelto)}.`}
        </p>
        <Recibo venta={vendida.venta} vuelto={vendida.vuelto} />
        <div className="acciones">
          <button type="button" className="boton boton--auto" onClick={nuevaVenta} autoFocus>
            Nueva venta
          </button>
        </div>
      </>
    )
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

  return (
    <form onSubmit={alCobrar} noValidate className="venta">
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

      <div className="venta__columnas">
        <section aria-label="Productos de la venta" className="venta__carrito">
          <BuscadorDeProductos
            etiqueta="Buscar producto o servicio"
            onElegir={agregar}
            opcionesAdicionales={serviciosPorCodigo}
            ayuda="Escribe 2 letras para buscar productos, o el código de un servicio (por ejemplo 101). Flechas y Enter para elegir; Esc borra."
          />
          <div role="status" className="texto-suave">
            {mensaje}
          </div>
          {!hayAlgo && <p className="texto-suave">Busca un producto o escribe el código de un servicio y pulsa Enter.</p>}
          {lineas.length > 0 && (
            <div className="tabla-contenedor">
              <table className="tabla">
                <caption className="solo-lectores">Productos de la venta</caption>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Precio</th>
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
                    return (
                      <tr key={linea.producto.id}>
                        <th scope="row">
                          {linea.producto.name}
                          <span className="tabla__detalle tabla__codigo">{linea.producto.code}</span>
                          {errores.length > 0 && (
                            <ul className="campo__errores">
                              {errores.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          )}
                        </th>
                        <td>
                          <input
                            type="number"
                            className="celda-numero"
                            aria-label={`Cantidad de ${linea.producto.name}`}
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
                          <span className="tabla__detalle">de {linea.producto.stock}</span>
                        </td>
                        <td>
                          {esDueno ? (
                            <>
                              <input
                                type="number"
                                className="celda-numero celda-numero--ancha"
                                aria-label={`Precio de ${linea.producto.name}`}
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
                        <td className="tabla__numero">{formatearPesos(linea.precio * linea.cantidad)}</td>
                        <td className="tabla__acciones">
                          <button
                            type="button"
                            className="boton-enlace"
                            aria-label={`Quitar ${linea.producto.name}`}
                            onClick={() => setLineas((actuales) => actuales.filter((_, i) => i !== indice))}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <section aria-label="Servicios del taller" className="venta__servicios">
            <div className="barra-de-acciones">
              <h3>Servicios del taller</h3>
              <CampoSelector
                etiqueta="Agregar servicio"
                value=""
                onChange={(e) => {
                  const tipo = tipos.data?.find((t) => String(t.id) === e.target.value)
                  if (tipo) agregarServicio(tipo)
                }}
                opciones={[
                  { valor: '', texto: tipos.isPending ? 'Cargando…' : 'Elige un servicio' },
                  ...(tipos.data ?? []).map((t) => ({ valor: String(t.id), texto: `${t.code} · ${t.name}` })),
                ]}
              />
            </div>
            {servicios.length > 0 && (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Servicios de la venta</caption>
                  <thead>
                    <tr>
                      <th scope="col">Servicio</th>
                      <th scope="col">Mecánico</th>
                      <th scope="col">Qué se hizo</th>
                      <th scope="col">Mano de obra</th>
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
                        <tr key={servicio.clave}>
                          <th scope="row">
                            {servicio.tipo.name}
                            <span className="tabla__detalle tabla__codigo">{servicio.tipo.code}</span>
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
                            <input
                              className="celda-texto"
                              aria-label={`Qué se hizo en ${nombre}`}
                              value={servicio.detalles}
                              maxLength={120}
                              onChange={(e) => cambiarServicio(servicio.clave, { detalles: e.target.value })}
                              placeholder="Opcional"
                            />
                          </td>
                          <td>
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
                              className="boton-enlace"
                              aria-label={`Quitar ${nombre}`}
                              onClick={() => setServicios((actuales) => actuales.filter((s) => s.clave !== servicio.clave))}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        <section aria-label="Cobro" className="venta__cobro">
          <SelectorDeCliente valor={cliente} onCambiar={setCliente} errores={[...(error?.campos.customer ?? []), ...(error?.campos['new_customer.name'] ?? [])]} />
          <dl className="venta__total" aria-label="Total de la venta">
            <dt>Total</dt>
            <dd>{formatearPesos(total)}</dd>
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
              <Campo
                etiqueta={canal === 'nequi' ? 'Valor por Nequi' : 'Valor por transferencia'}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={transferencia}
                onChange={(e) => setTransferencia(e.target.value)}
                errores={transferenciaDeMas ? ['No puede ser mayor que el total.'] : undefined}
                ayuda="El resto se cobra en efectivo."
              />
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
          )}
          {vuelto > 0 && (
            <p role="status" className="venta__vuelto">
              Vuelto: <strong>{formatearPesos(vuelto)}</strong>
            </p>
          )}
          <Campo etiqueta="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={150} autoComplete="off" />
          <button type="submit" className="boton venta__cobrar" disabled={!puedeCobrar}>
            {cobrar.isPending ? 'Cobrando…' : `Cobrar ${formatearPesos(total)}`}
          </button>
          {!bloqueada && faltaMecanico && <p className="campo__ayuda">Elige el mecánico de cada servicio para cobrar.</p>}
          <p className="campo__ayuda">El total es orientativo: el programa confirma los precios al cobrar.</p>
        </section>
      </div>
    </form>
  )
}
