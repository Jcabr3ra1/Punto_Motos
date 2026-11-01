import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { listarMarcas, listarMotos, listarTipos } from '../../api/catalogo'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { cargarProductoInicial } from '../../api/inventario'
import { crearProducto, editarProducto, sugerirCodigo } from '../../api/productos'
import type { InitialCountItemInput, Product, ProductInput } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Casilla } from '../../components/Casilla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { useDebounce } from '../../hooks/useDebounce'

interface Props {
  /** Si se recibe, se edita ese producto; si no, se crea uno nuevo. */
  producto?: Product
  onTerminar: (aviso: string) => void
  /** Sin esta función no hay botón de cancelar (por ejemplo, en la carga del inventario inicial). */
  onCancelar?: () => void
  /**
   * Carga un producto nuevo del inventario inicial: agrega «Cantidad contada» y crea el producto
   * junto con su movimiento (POST /inventory/initial-count/items).
   */
  conteoInicial?: boolean
}

// Alta y edición de productos (solo el dueño). Los tipos, marcas y motos alimentan los desplegables.
export function FormularioDeProducto(props: Props) {
  const tipos = useQuery({ queryKey: claves.catalogoActivo('categories'), queryFn: ({ signal }) => listarTipos(signal) })
  const marcas = useQuery({ queryKey: claves.catalogoActivo('brands'), queryFn: ({ signal }) => listarMarcas(signal) })
  const motos = useQuery({ queryKey: claves.catalogoActivo('motos'), queryFn: ({ signal }) => listarMotos(signal) })

  const fallida = [tipos, marcas, motos].find((consulta) => consulta.isError)
  if (fallida) {
    return (
      <ErrorDeCarga
        error={fallida.error}
        onReintentar={() => {
          void tipos.refetch()
          void marcas.refetch()
          void motos.refetch()
        }}
      />
    )
  }
  if (!tipos.data || !marcas.data || !motos.data) return <Cargando />

  return <Campos {...props} tipos={tipos.data} marcas={marcas.data} motos={motos.data} />
}

type Listas = {
  tipos: { id: number; name: string }[]
  marcas: { id: number; name: string }[]
  motos: { id: number; name: string }[]
}

/** Agrega a la lista lo que el producto ya tiene aunque se haya desactivado después, para no mostrar un valor falso. */
function conLoActual<T extends { id: number; name: string }>(lista: T[], actuales: (T | null | undefined)[]): T[] {
  const faltantes = actuales.filter((a): a is T => !!a && !lista.some((x) => x.id === a.id))
  const sinRepetir = faltantes.filter((a, i) => faltantes.findIndex((b) => b.id === a.id) === i)
  return [...lista, ...sinRepetir.map((a) => ({ ...a, name: `${a.name} (desactivado)` }))]
}

function Campos({ producto, onTerminar, onCancelar, conteoInicial = false, ...catalogos }: Props & Listas) {
  const clienteDeConsultas = useQueryClient()
  const editando = producto !== undefined
  const tipos = conLoActual(catalogos.tipos, [producto?.category])
  const marcas = conLoActual(catalogos.marcas, [producto?.brand])
  const motos = conLoActual(catalogos.motos, [producto?.moto, ...(producto?.compatible_motos ?? [])])

  const [nombre, setNombre] = useState(producto?.name ?? '')
  const [tipo, setTipo] = useState(producto ? String(producto.category.id) : '')
  const [marca, setMarca] = useState(producto?.brand ? String(producto.brand.id) : '')
  const [moto, setMoto] = useState(producto?.moto ? String(producto.moto.id) : '')
  const [compatibles, setCompatibles] = useState<number[]>(producto?.compatible_motos.map((m) => m.id) ?? [])
  const [codigo, setCodigo] = useState(producto?.code ?? '')
  const [costo, setCosto] = useState(producto?.cost_price === undefined ? '' : String(producto.cost_price))
  const [precio, setPrecio] = useState(producto ? String(producto.sale_price) : '')
  const [minimo, setMinimo] = useState(producto ? String(producto.min_stock) : '0')
  const [ubicacion, setUbicacion] = useState(producto?.location ?? '')
  const [esInsumo, setEsInsumo] = useState(producto?.is_workshop_supply ?? false)
  const [activo, setActivo] = useState(producto?.is_active ?? true)
  const [cantidad, setCantidad] = useState('')

  // Sugerencia de código: solo al crear, y con una pausa corta mientras el dueño escribe.
  const nombreConPausa = useDebounce(nombre.trim())
  const sugerencia = useQuery({
    queryKey: ['sugerencia-de-codigo', tipo, nombreConPausa, moto],
    queryFn: ({ signal }) =>
      sugerirCodigo({ category: Number(tipo), name: nombreConPausa, moto: moto ? Number(moto) : null }, signal),
    enabled: !editando && tipo !== '' && nombreConPausa.length >= 2,
  })
  const codigoSugerido = sugerencia.data?.code ?? ''

  const guardar = useMutation({
    mutationFn: () => {
      // Los campos vacíos no se envían: el backend responde "Este campo es requerido." junto a cada uno.
      const datos = {
        name: nombre,
        category: tipo ? Number(tipo) : undefined,
        brand: marca ? Number(marca) : null,
        moto: moto ? Number(moto) : null,
        compatible_motos: compatibles,
        ...(codigo.trim() ? { code: codigo } : {}),
        ...(costo !== '' ? { cost_price: Number(costo) } : {}),
        ...(precio !== '' ? { sale_price: Number(precio) } : {}),
        min_stock: minimo === '' ? 0 : Number(minimo),
        location: ubicacion,
        is_workshop_supply: esInsumo,
        is_active: activo,
      } as ProductInput
      if (conteoInicial) {
        const conCantidad = { ...datos, ...(cantidad !== '' ? { quantity: Number(cantidad) } : {}) }
        return cargarProductoInicial(conCantidad as InitialCountItemInput)
      }
      return editando ? editarProducto(producto.id, datos) : crearProducto(datos)
    },
    onSuccess: async (guardado) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.productos })
      if (conteoInicial) await clienteDeConsultas.invalidateQueries({ queryKey: claves.conteoInicial })
      // El aviso usa lo que confirmó el backend, no el cálculo de la pantalla.
      const unidades = `${guardado.stock} ${guardado.stock === 1 ? 'unidad' : 'unidades'}`
      const base = conteoInicial
        ? `Producto «${guardado.name}» cargado con ${unidades}. Código ${guardado.code}.`
        : editando
          ? `Cambios de «${guardado.name}» guardados.`
          : `Producto «${guardado.name}» creado con el código ${guardado.code}.`
      onTerminar(guardado.sells_below_cost ? `${base} Atención: se vende por debajo del costo.` : base)
    },
    onError: (fallo) => {
      // Si el conteo ya terminó, se vuelve a consultar su estado para que la pantalla lo refleje.
      if (conteoInicial && isApiError(fallo) && fallo.code === 'initial_count_finished') {
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.conteoInicial })
      }
    },
  })

  const error = guardar.isError ? desglosarError(guardar.error) : null
  // Cálculo orientativo para avisar mientras se escribe.
  const bajoElCosto = costo !== '' && precio !== '' && Number(precio) < Number(costo)

  function alCambiarMoto(valor: string) {
    setMoto(valor)
    // La moto principal no puede estar también entre las compatibles.
    setCompatibles((actuales) => actuales.filter((id) => String(id) !== valor))
  }

  function alternarCompatible(id: number, marcada: boolean) {
    setCompatibles((actuales) => (marcada ? [...actuales, id] : actuales.filter((x) => x !== id)))
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario formulario--ancho">
      <AvisoDeError mensajes={error?.generales ?? []} />
      <Campo
        etiqueta="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        errores={error?.campos.name}
        ayuda="Empieza por la palabra clave: «Pastillas de freno Pulsar 180»."
        maxLength={150}
        autoComplete="off"
        autoFocus
        required
      />
      <div className="campos-en-fila">
        <CampoSelector
          etiqueta="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          opciones={[{ valor: '', texto: 'Elige un tipo' }, ...tipos.map((t) => ({ valor: String(t.id), texto: t.name }))]}
          errores={error?.campos.category}
          required
        />
        <CampoSelector
          etiqueta="Marca"
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          opciones={[{ valor: '', texto: 'Sin marca' }, ...marcas.map((m) => ({ valor: String(m.id), texto: m.name }))]}
          errores={error?.campos.brand}
        />
      </div>
      <CampoSelector
        etiqueta="Moto"
        value={moto}
        onChange={(e) => alCambiarMoto(e.target.value)}
        opciones={[
          { valor: '', texto: 'Universal (sirve para todas)' },
          ...motos.map((m) => ({ valor: String(m.id), texto: m.name })),
        ]}
        errores={error?.campos.moto}
      />
      <fieldset className="conjunto" aria-describedby="compatibles-ayuda">
        <legend>Motos compatibles</legend>
        <p id="compatibles-ayuda" className="campo__ayuda">
          Otras motos en las que también sirve, además de la principal.
        </p>
        <div className="conjunto__opciones">
          {motos
            .filter((m) => String(m.id) !== moto)
            .map((m) => (
              <Casilla
                key={m.id}
                etiqueta={m.name}
                checked={compatibles.includes(m.id)}
                onChange={(e) => alternarCompatible(m.id, e.target.checked)}
              />
            ))}
          {motos.length === 0 && <p className="texto-suave">Todavía no hay motos creadas.</p>}
        </div>
        {error?.campos.compatible_motos && (
          <ul className="campo__errores">
            {error.campos.compatible_motos.map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}
      </fieldset>
      <Campo
        etiqueta="Código interno"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        errores={error?.campos.code}
        placeholder={codigoSugerido || (editando ? '' : 'Se genera solo')}
        ayuda={
          editando
            ? 'Solo letras, números y guiones. Si lo cambias, debe ser único.'
            : 'Déjalo vacío para que se genere solo. Solo letras, números y guiones.'
        }
        autoComplete="off"
      />
      {!editando && codigoSugerido && codigo.trim() === '' && (
        <p className="sugerencia">
          Código sugerido: <strong>{codigoSugerido}</strong>{' '}
          <button type="button" className="boton-enlace" onClick={() => setCodigo(codigoSugerido)}>
            Usar este código
          </button>
        </p>
      )}
      <div className="campos-en-fila">
        <Campo
          etiqueta="Costo"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={costo}
          onChange={(e) => setCosto(e.target.value)}
          errores={error?.campos.cost_price}
          ayuda="En pesos, sin puntos ni decimales: 18000."
          required
        />
        <Campo
          etiqueta="Precio de venta"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          errores={error?.campos.sale_price}
          ayuda="En pesos, sin puntos ni decimales: 25000."
          required
        />
      </div>
      {bajoElCosto && (
        <p role="status" className="aviso aviso--advertencia">
          El precio de venta es menor que el costo: cada venta dejaría pérdida. Puedes guardarlo igual.
        </p>
      )}
      {conteoInicial && (
        <Campo
          etiqueta="Cantidad contada"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          errores={error?.campos.quantity}
          ayuda="Las unidades que hay hoy en el negocio. Con 0 se crea el producto sin unidades."
          required
        />
      )}
      <div className="campos-en-fila">
        <Campo
          etiqueta="Existencia mínima"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={minimo}
          onChange={(e) => setMinimo(e.target.value)}
          errores={error?.campos.min_stock}
          ayuda="Con esta cantidad o menos se marca «Reponer»."
        />
        <Campo
          etiqueta="Ubicación"
          value={ubicacion}
          onChange={(e) => setUbicacion(e.target.value)}
          errores={error?.campos.location}
          ayuda="Por ejemplo: Estante B2."
          autoComplete="off"
        />
      </div>
      {editando && (
        <p className="texto-suave">
          Existencia actual: <strong>{producto.stock}</strong>. Cambia con el inventario, no desde aquí.
        </p>
      )}
      <Casilla
        etiqueta="Insumo de taller"
        checked={esInsumo}
        onChange={(e) => setEsInsumo(e.target.checked)}
        ayuda="Está incluido en la mano de obra de los servicios, como el aceite o la grasa."
      />
      {editando && (
        <Casilla
          etiqueta="Producto activo"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          ayuda="Si lo desactivas deja de aparecer en el buscador de venta. Su historial se conserva."
        />
      )}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : conteoInicial ? 'Cargar producto' : editando ? 'Guardar cambios' : 'Crear producto'}
        </button>
        {onCancelar && (
          <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
