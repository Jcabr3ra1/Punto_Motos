import { invoke, isTauri } from '@tauri-apps/api/core'
import { useIsMutating } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { getSessionToken } from '../api/client'

interface Actualizacion { version: string; notes: string | null }

export function Actualizaciones() {
  const [desktop] = useState(isTauri)
  const [update, setUpdate] = useState<Actualizacion | null>(null)
  const [mensaje, setMensaje] = useState('Buscando actualizaciones…')
  const [buscando, setBuscando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [instalando, setInstalando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mutaciones = useIsMutating()
  const dialogo = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!desktop) return
    let activo = true
    void invoke<Actualizacion | null>('check_update').then((value) => {
      if (activo) { setUpdate(value); setMensaje(value ? '' : 'Tienes la versión más reciente.') }
    }).catch(() => { if (activo) setMensaje('No se pudo buscar una actualización. Puedes seguir trabajando.') })
    return () => { activo = false }
  }, [desktop])

  useEffect(() => {
    if (confirmar && dialogo.current && !dialogo.current.open) dialogo.current.showModal?.()
  }, [confirmar])

  async function buscar() {
    setBuscando(true)
    try {
      const value = await invoke<Actualizacion | null>('check_update')
      setUpdate(value)
      setMensaje(value ? '' : 'Tienes la versión más reciente.')
    } catch { setMensaje('No se pudo buscar una actualización. Puedes seguir trabajando.') }
    finally { setBuscando(false) }
  }

  async function instalar() {
    if (mutaciones > 0 || instalando) return
    setInstalando(true)
    setError(null)
    try { await invoke('install_update', { sessionToken: getSessionToken() ?? '' }) }
    catch {
      setError('No se pudo instalar la actualización. Si el programa perdió la conexión, ciérralo y vuelve a abrirlo. Tus datos se conservan.')
      setConfirmar(false)
      setInstalando(false)
    }
  }

  if (!desktop) return null
  return <section className="actualizaciones" aria-label="Actualizaciones del programa">
    <h2>Actualizaciones del programa</h2>
    {mensaje && <p role="status">{mensaje}</p>}
    {update && <>
      <p>Está disponible la versión {update.version}.</p>
      {update.notes && <p className="actualizaciones__notas">{update.notes}</p>}
      <button className="boton" type="button" onClick={() => setConfirmar(true)} disabled={mutaciones > 0 || instalando}>Actualizar y reiniciar</button>
    </>}
    <button className="boton boton--secundario" type="button" onClick={() => { void buscar() }} disabled={buscando || instalando}>Buscar actualizaciones</button>
    {error && <p role="alert">{error}</p>}
    {confirmar && <dialog ref={dialogo} className="actualizaciones__dialogo" aria-labelledby="actualizar-titulo" onCancel={(event) => {
      if (instalando) event.preventDefault()
      else setConfirmar(false)
    }}>
      <h2 id="actualizar-titulo">Actualizar Punto Moto</h2>
      <p>Termina y guarda tus operaciones antes de continuar. Se descargará y verificará la nueva versión y el programa se cerrará para instalarla.</p>
      <p>Los datos se conservan. Si la base necesita cambios, se respaldará antes de aplicarlos al volver a abrir.</p>
      {instalando ? <p role="status">Descargando y verificando la actualización. Espera a que termine el instalador…</p> : <>
        <button className="boton" type="button" disabled={mutaciones > 0} onClick={() => { void instalar() }}>Instalar ahora</button>
        <button className="boton boton--secundario" type="button" onClick={() => setConfirmar(false)}>Más tarde</button>
      </>}
    </dialog>}
  </section>
}
