import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { claves } from '../../api/consultas'
import { isApiError } from '../../api/client'
import { descargarCopiaDeSeguridad, obtenerNegocio } from '../../api/negocio'
import { AvisoDeError } from '../../components/AvisoDeError'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearFechaHora } from '../../utilidades/fechas'

const DIAS_ALERTA = 7
const MS_POR_DIA = 86_400_000

/** Permite al dueño descargar una copia SQLite verificada del negocio para guardarla fuera del equipo. */
export function CopiasDeSeguridad() {
  const clienteDeConsultas = useQueryClient()
  const [ahora, setAhora] = useState(() => Date.now())
  const [descargando, setDescargando] = useState(false)
  const [exito, setExito] = useState<string | null>(null)
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null)

  const negocio = useQuery({
    queryKey: claves.negocio,
    queryFn: ({ signal }) => obtenerNegocio(signal),
  })

  const ultima = negocio.data?.last_backup_at ?? null
  const diasDesdeUltima = ultima ? Math.max(0, Math.floor((ahora - Date.parse(ultima)) / MS_POR_DIA)) : null
  const atrasado = !ultima || (diasDesdeUltima !== null && diasDesdeUltima >= DIAS_ALERTA)

  async function manejarDescarga() {
    if (descargando) return
    setDescargando(true)
    setExito(null)
    setErrorDescarga(null)
    try {
      const { filename } = await descargarCopiaDeSeguridad()
      setAhora(Date.now())
      await Promise.all([
        clienteDeConsultas.invalidateQueries({ queryKey: claves.negocio }),
        clienteDeConsultas.invalidateQueries({ queryKey: claves.notificaciones }),
      ])
      setExito(`Copia descargada: ${filename}. Guárdala en una USB, otro disco o en la nube.`)
    } catch (err) {
      setErrorDescarga(isApiError(err) ? err.message : 'No se pudo generar la copia de seguridad.')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <section>
      <EncabezadoDePantalla
        icono={DESTINOS.respaldos.icono}
        titulo="Copias de seguridad"
        descripcion="Descarga una copia completa de tus ventas, inventario, caja y taller para guardarla fuera de este equipo."
      />
      <div className="tarjeta-de-formulario respaldo-tarjeta">
        {negocio.isPending && <Cargando />}
        {negocio.isError && <ErrorDeCarga error={negocio.error} onReintentar={() => void negocio.refetch()} />}
        {negocio.isSuccess && (
          <>
            <div className={`respaldo-estado${atrasado ? ' respaldo-estado--aviso' : ''}`}>
              <p className="respaldo-estado__rotulo">Última copia descargada</p>
              <p className="respaldo-estado__valor">
                {ultima ? formatearFechaHora(ultima) : 'Todavía no se ha descargado ninguna copia externa'}
              </p>
              <p className="respaldo-estado__detalle">
                {!ultima
                  ? 'Conviene descargar una primera copia hoy mismo y guardarla en una memoria USB o carpeta en la nube.'
                  : atrasado
                    ? `Pasaron ${diasDesdeUltima} días desde la última descarga. Se recomienda respaldar cada semana.`
                    : 'Tus datos locales también se respaldan automáticamente antes de cada actualización del programa.'}
              </p>
            </div>

            {exito && (
              <p role="status" className="aviso aviso--exito">
                {exito}
              </p>
            )}
            {errorDescarga && <AvisoDeError mensajes={[errorDescarga]} />}

            <div className="respaldo-acciones">
              <button
                type="button"
                className="boton boton--auto boton--con-icono"
                disabled={descargando}
                onClick={() => void manejarDescarga()}
              >
                <Download aria-hidden="true" size={16} />
                {descargando ? 'Generando copia…' : 'Descargar copia de seguridad'}
              </button>
            </div>

            <div className="respaldo-guia">
              <h2>Cómo funciona el guardado de tus datos</h2>
              <ul>
                <li>Cada venta, servicio, compra o movimiento se guarda al instante en tu equipo, con o sin internet.</li>
                <li>La copia descargada incluye toda la base verificada (`PRAGMA integrity_check`) lista para conservarse.</li>
                <li>Si falla el disco duro o cambias de computador, la copia externa permite recuperar tu negocio.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
