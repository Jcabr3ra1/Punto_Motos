import { ChevronRight, LogOut, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useUsuario } from '../auth/useUsuario'
import { useCajaActual } from '../hooks/useCajaActual'
import { useNegocio } from '../hooks/useNegocio'
import { ubicacionDe } from '../navegacion/ubicacion'
import { formatearPesos } from '../utilidades/dinero'

/** Iniciales para el círculo de la barra: «Carlos Pérez» → «CP». */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0].toUpperCase())
    .join('')

const formatoDeFecha = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
const formatoDeHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })

/** «mié, 4 de nov» → «Mié, 4 de nov». */
const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

/** La hora del equipo, actualizada cada 30 segundos. */
function useReloj() {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const temporizador = setInterval(() => setAhora(new Date()), 30_000)
    return () => clearInterval(temporizador)
  }, [])
  return ahora
}

// Barra superior, como la de un programa de escritorio: dónde estás, el estado de la caja, la fecha y la
// persona con la sesión abierta. data-tauri-drag-region: si la ventana se configura sin barra de título nativa,
// esta barra sirve para arrastrarla.
export function BarraSuperior({ onBuscar }: { onBuscar: () => void }) {
  const usuario = useUsuario()
  const esDueno = usuario.role === 'owner'
  const { cerrarSesion } = useAuth()
  const [saliendo, setSaliendo] = useState(false)
  // Mientras el dueño no llene los datos del negocio, o si no se pueden cargar, se muestra el nombre del programa.
  const negocio = useNegocio()
  const nombreDelNegocio = negocio.data?.name.trim() || 'Punto Moto'
  const { seccion, pestana } = ubicacionDe(useLocation().pathname)
  const caja = useCajaActual()
  const ahora = useReloj()

  async function alSalir() {
    setSaliendo(true)
    await cerrarSesion()
  }

  return (
    <header className="navbar" data-tauri-drag-region>
      <div className="navbar__ubicacion" data-tauri-drag-region>
        <p className="navbar__negocio">{nombreDelNegocio}</p>
        {seccion && (
          <nav aria-label="Estás en" className="navbar__migas">
            <span className="navbar__seccion">{seccion}</span>
            {pestana && (
              <>
                <ChevronRight className="navbar__separador" aria-hidden="true" size={14} />
                <span>{pestana}</span>
              </>
            )}
          </nav>
        )}
      </div>

      <div className="navbar__lado">
        <button type="button" className="navbar__buscar" onClick={onBuscar} aria-keyshortcuts="Control+K">
          <Search aria-hidden="true" size={15} strokeWidth={1.75} />
          <span>Buscar pantalla…</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        {caja.isSuccess && <EstadoDeLaCaja abierta={caja.data.is_open} esperado={caja.data.session?.expected_cash} esDueno={esDueno} />}
        <p className="navbar__reloj" aria-label="Fecha y hora">
          <span>{conMayuscula(formatoDeFecha.format(ahora))}</span>
          <strong>{formatoDeHora.format(ahora)}</strong>
        </p>
        <div className="navbar__usuario">
          <span className="navbar__iniciales" aria-hidden="true">
            {iniciales(usuario.display_name)}
          </span>
          <div className="navbar__datos">
            <p className="navbar__nombre">{usuario.display_name}</p>
            <p className="navbar__rol">{usuario.role_label}</p>
          </div>
        </div>
        <button type="button" className="navbar__salir" onClick={alSalir} disabled={saliendo} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  )
}

/** El dueño ve el efectivo esperado y puede ir a la caja; el vendedor solo ve si está abierta. */
function EstadoDeLaCaja({ abierta, esperado, esDueno }: { abierta: boolean; esperado?: number; esDueno: boolean }) {
  const clase = `navbar__caja navbar__caja--${abierta ? 'abierta' : 'cerrada'}`
  const texto = abierta
    ? esDueno && esperado !== undefined
      ? `Caja abierta · ${formatearPesos(esperado)} en el cajón`
      : 'Caja abierta'
    : esDueno
      ? 'Caja cerrada · Abrir'
      : 'Caja cerrada'
  return esDueno ? (
    <Link to="/caja/actual" className={clase}>
      {texto}
    </Link>
  ) : (
    <p className={clase}>{texto}</p>
  )
}
