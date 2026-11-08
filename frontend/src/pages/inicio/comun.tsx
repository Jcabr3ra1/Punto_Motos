import { House, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUsuario } from '../../auth/useUsuario'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { useAtajo } from '../../hooks/useAtajo'
import { DESTINOS } from '../../navegacion/destinos'
import { saludoSegunHora } from '../../utilidades/saludo'
import { diaLargo } from './formato'

/** Saludo, fecha y acciones de Inicio. Ctrl+N abre Vender. */
export function EncabezadoDeInicio({ subtitulo, acciones }: { subtitulo: string; acciones?: ReactNode }) {
  const usuario = useUsuario()
  const navegar = useNavigate()
  // La hora del saludo se toma al entrar a Inicio.
  const [ahora] = useState(() => new Date())
  useAtajo('n', () => navegar(DESTINOS.vender.ruta))
  return (
    <EncabezadoDePantalla
      nivel={1}
      icono={House}
      titulo={`${saludoSegunHora(ahora)}, ${usuario.display_name}`}
      descripcion={`${diaLargo(ahora)} · ${subtitulo}`}
      acciones={
        <>
          {acciones}
          <Link to={DESTINOS.vender.ruta} className="boton boton--auto boton--con-icono" aria-keyshortcuts="Control+N">
            <Plus aria-hidden="true" size={16} />
            Nueva venta
            <kbd className="atajo-visible" aria-hidden="true">Ctrl+N</kbd>
          </Link>
        </>
      }
    />
  )
}

/** Recuadro de Inicio con su rótulo; con `oscuro`, en negro como un instrumento del tablero. */
export function Instrumento({
  id,
  titulo,
  extra,
  oscuro,
  pie,
  children,
}: {
  id: string
  titulo: string
  /** A la derecha del rótulo, por ejemplo «23 ventas». */
  extra?: ReactNode
  oscuro?: boolean
  /** Enlace o botón al pie, alineado abajo en todos los recuadros de la fila. */
  pie?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`instrumento${oscuro ? ' instrumento--oscuro' : ''}`} aria-labelledby={id}>
      <p className="instrumento__cabecera">
        <span id={id}>{titulo}</span>
        {extra && <span className="instrumento__extra">{extra}</span>}
      </p>
      {children}
      {pie && <div className="instrumento__pie">{pie}</div>}
    </section>
  )
}

export function Cargando() {
  return (
    <div className="instrumento__cargando" aria-busy="true">
      <span className="esqueleto instrumento__esqueleto-cifra" />
      <span className="esqueleto instrumento__esqueleto-linea" />
    </div>
  )
}

export function NoSePudoCargar() {
  return <p className="instrumento__error">No se pudo cargar. Se intentará de nuevo en un momento.</p>
}
