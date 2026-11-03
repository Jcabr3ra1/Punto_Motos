import { useState } from 'react'
import type { TipoDeCatalogo } from '../../../api/catalogo'
import { Titulo } from '../../../components/Titulo'
import { ListaDeCatalogo, type SeccionDeCatalogo } from './ListaDeCatalogo'

const SECCIONES: readonly SeccionDeCatalogo[] = [
  {
    tipo: 'categories',
    etiqueta: 'Tipos',
    nuevo: 'Nuevo tipo',
    creado: (nombre) => `Tipo «${nombre}» creado.`,
    conSigla: true,
    ayudaSigla: 'De 2 a 8 letras. Es la primera parte del código del producto, por ejemplo FRE para Frenos.',
    descripcion: 'Familias de repuestos, como Frenos o Eléctrico. Su sigla arma el código de cada producto.',
  },
  {
    tipo: 'brands',
    etiqueta: 'Marcas',
    nuevo: 'Nueva marca',
    creado: (nombre) => `Marca «${nombre}» creada.`,
    conSigla: false,
    descripcion: 'Fabricantes de los repuestos, como NGK o Bosch.',
  },
  {
    tipo: 'motos',
    etiqueta: 'Motos',
    nuevo: 'Nueva moto',
    creado: (nombre) => `Moto «${nombre}» creada.`,
    conSigla: true,
    ayudaSigla:
      'De 2 a 8 letras. Es la segunda parte del código: Pulsar 180 y Pulsar 200 pueden compartir PUL. UNI está reservada para los repuestos universales.',
    descripcion: 'Modelos de moto a los que se asocian los repuestos.',
  },
]

// Administración de tipos, marcas y motos (solo el dueño). No se borran: se desactivan.
export function Catalogo() {
  const [tipo, setTipo] = useState<TipoDeCatalogo>('categories')
  const seccion = SECCIONES.find((s) => s.tipo === tipo) ?? SECCIONES[0]

  return (
    <section>
      <Titulo nivel={2}>Tipos, marcas y motos</Titulo>
      <div role="group" aria-label="Sección del catálogo" className="selector-de-seccion">
        {SECCIONES.map((s) => (
          <button
            key={s.tipo}
            type="button"
            className="selector-de-seccion__opcion"
            aria-pressed={s.tipo === tipo}
            onClick={() => setTipo(s.tipo)}
          >
            {s.etiqueta}
          </button>
        ))}
      </div>
      {/* La clave reinicia la lista y sus formularios al cambiar de sección. */}
      <ListaDeCatalogo key={seccion.tipo} seccion={seccion} />
    </section>
  )
}
