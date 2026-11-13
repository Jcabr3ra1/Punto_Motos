import { ChevronRight, LogOut, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { useUsuario } from '../auth/useUsuario'
import { useCajaActual } from '../hooks/useCajaActual'
import { useNegocio } from '../hooks/useNegocio'
import { ubicacionDe } from '../navegacion/ubicacion'
import { formatearPesos } from '../utilidades/dinero'
import { Notificaciones } from './Notificaciones'

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
                <ChevronRight className="navbar__separador" aria-hidden="true" size={18} strokeWidth={2.25} />
                <span>{pestana}</span>
              </>
            )}
          </nav>
        )}
      </div>

      {/* A la derecha, todo con la misma forma: rótulo pequeño arriba y valor abajo, separados por líneas finas. */}
      <div className="navbar__lado">
        <Notificaciones />
        <button type="button" className="navbar__buscar" onClick={onBuscar} aria-label="Buscar pantalla" aria-keyshortcuts="Control+K">
          <Search aria-hidden="true" size={16} strokeWidth={1.75} />
          <span>Buscar</span>
          <kbd aria-hidden="true">Ctrl K</kbd>
        </button>
        {caja.isSuccess && (
          <>
            <span className="navbar__divisor" aria-hidden="true" />
            <EstadoDeLaCaja abierta={caja.data.is_open} esperado={caja.data.session?.expected_cash} esDueno={esDueno} />
          </>
        )}
        <span className="navbar__divisor" aria-hidden="true" />
        <p className="navbar__dato" aria-label="Fecha y hora">
          <span className="navbar__rotulo">{conMayuscula(formatoDeFecha.format(ahora))}</span>
          <strong className="navbar__valor navbar__valor--hora">{formatoDeHora.format(ahora)}</strong>
        </p>
        <span className="navbar__divisor navbar__divisor--usuario" aria-hidden="true" />
        <div className="navbar__dato navbar__usuario">
          <p className="navbar__rotulo">{usuario.role_label}</p>
          <p className="navbar__valor">{usuario.display_name}</p>
        </div>
        <button type="button" className="navbar__salir" onClick={alSalir} disabled={saliendo} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  )
}

/** El dueño ve el efectivo esperado y puede ir a la caja; el vendedor solo ve si está abierta. */
function EstadoDeLaCaja({ abierta, esperado, esDueno }: { abierta: boolean; esperado?: number; esDueno: boolean }) {
  const estado = abierta ? 'abierta' : 'cerrada'
  const rotulo = abierta ? 'Caja abierta' : 'Caja cerrada'
  const valor = abierta
    ? esDueno && esperado !== undefined
      ? formatearPesos(esperado)
      : 'Lista para vender'
    : esDueno
      ? 'Abrir la caja'
      : 'Pídele al dueño'
  // La frase completa para el lector de pantalla; a la vista, rótulo y valor como el resto de la barra.
  const completo = abierta
    ? esDueno && esperado !== undefined
      ? `Caja abierta · ${formatearPesos(esperado)} en el cajón`
      : 'Caja abierta'
    : esDueno
      ? 'Caja cerrada · Abrir'
      : 'Caja cerrada'
  const contenido = (
    <>
      <span className="navbar__rotulo">{rotulo}</span>
      <span className="navbar__valor">{valor}</span>
    </>
  )
  return esDueno ? (
    <Link to="/caja/actual" className={`navbar__dato navbar__caja navbar__caja--${estado}`} aria-label={completo}>
      {contenido}
    </Link>
  ) : (
    <p className={`navbar__dato navbar__caja navbar__caja--${estado}`}>{contenido}</p>
  )
}
