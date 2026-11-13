import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { listarMarcas, listarMotos, listarTipos, type TipoDeCatalogo } from '../../../api/catalogo'
import { claves } from '../../../api/consultas'
import { EncabezadoDePantalla } from '../../../components/EncabezadoDePantalla'
import { useAtajo } from '../../../hooks/useAtajo'
import { DESTINOS } from '../../../navegacion/destinos'
import { ListaDeCatalogo, type SeccionDeCatalogo } from './ListaDeCatalogo'

const SECCIONES: readonly SeccionDeCatalogo[] = [
  {
    tipo: 'categories',
    etiqueta: 'Tipos',
    nuevo: 'Nuevo tipo',
    creado: (nombre) => `Tipo «${nombre}» creado.`,
    conSigla: true,
    ayudaSigla: 'De 2 a 8 letras. Se usa al inicio del código del producto, por ejemplo FRE para Frenos o ACE para Aceites.',
    descripcion: 'Categorías para agrupar tus repuestos (ej. Llantas, Aceites, Frenos). Sirven para filtrar el inventario, armar los códigos y ver cuánto vendiste por cada categoría.',
  },
  {
    tipo: 'brands',
    etiqueta: 'Marcas',
    nuevo: 'Nueva marca',
    creado: (nombre) => `Marca «${nombre}» creada.`,
    conSigla: false,
    descripcion: 'Fabricantes o marcas de los repuestos y consumibles (ej. Motul, NGK, Bosch, Pirelli) para distinguir productos equivalentes.',
  },
  {
    tipo: 'motos',
    etiqueta: 'Motos',
    nuevo: 'Nueva moto',
    creado: (nombre) => `Moto «${nombre}» creada.`,
    conSigla: true,
    ayudaSigla:
      'De 2 a 8 letras. Se usa como segunda parte del código: Pulsar 180 y Pulsar 200 pueden compartir PUL. La sigla UNI queda reservada para repuestos universales.',
    descripcion: 'Referencias o líneas de moto (ej. Pulsar 180, Boxer CT 100, NKD 125). Ayudan a encontrar rápido qué repuesto le sirve a la moto del cliente.',
  },
]

// Administración de tipos, marcas y motos (solo el dueño). No se borran: se desactivan.
export function Catalogo() {
  const [tipo, setTipo] = useState<TipoDeCatalogo>('categories')
  const [creando, setCreando] = useState(false)
  const seccion = SECCIONES.find((s) => s.tipo === tipo) ?? SECCIONES[0]
  // Cuántos hay activos de cada uno (en las pestañas): listas sin paginar, la cifra es exacta.
  const tipos = useQuery({ queryKey: claves.catalogoActivo('categories'), queryFn: ({ signal }) => listarTipos(signal) })
  const marcas = useQuery({ queryKey: claves.catalogoActivo('brands'), queryFn: ({ signal }) => listarMarcas(signal) })
  const motos = useQuery({ queryKey: claves.catalogoActivo('motos'), queryFn: ({ signal }) => listarMotos(signal) })
  useAtajo('n', () => setCreando(true))

  return (
    <section className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.catalogo.icono}
        titulo="Tipos, marcas y motos"
        descripcion="Organiza cómo clasificas los repuestos para crear códigos ordenados, filtrar en inventario y encontrar rápido lo que busca el cliente. Si algo ya no se usa, se desactiva sin borrar el historial."
        acciones={
          <button type="button" className="boton boton--auto boton--con-icono" onClick={() => setCreando(true)} aria-keyshortcuts="Control+N">
            <Plus aria-hidden="true" size={16} />
            {seccion.nuevo}
            <kbd className="atajo-visible" aria-hidden="true">Ctrl+N</kbd>
          </button>
        }
      />
      {/* Lo primero que se ve: con cuál de las tres listas se trabaja. */}
      <div className="secciones-catalogo" role="group" aria-label="Sección del catálogo">
        {SECCIONES.map((s) => {
          const consulta = s.tipo === 'categories' ? tipos : s.tipo === 'brands' ? marcas : motos
          return (
            <button
              key={s.tipo}
              type="button"
              className="secciones-catalogo__boton"
              aria-pressed={s.tipo === seccion.tipo}
              onClick={() => {
                setCreando(false)
                setTipo(s.tipo)
              }}
            >
              {s.etiqueta}
              <span className="secciones-catalogo__cifra" aria-hidden="true">
                {consulta.data?.length ?? '…'}
              </span>
            </button>
          )
        })}
      </div>
      {/* La clave reinicia la lista, sus filtros y sus formularios al cambiar de sección. */}
      <ListaDeCatalogo
        key={seccion.tipo}
        seccion={seccion}
        creando={creando}
        onCerrarCreacion={() => setCreando(false)}
      />
    </section>
  )
}
