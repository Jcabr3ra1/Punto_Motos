import { isTauri } from '@tauri-apps/api/core'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef } from 'react'

/** Ventana pequeña para entrar, como la de un lanzador; la misma de `tauri.conf.json`. */
export const VENTANA_DE_ACCESO = { ancho: 760, alto: 500 }
/** Ventana de trabajo y el mínimo por debajo del cual el programa no se encoge. */
export const VENTANA_DE_TRABAJO = { ancho: 1280, alto: 800, anchoMinimo: 900, altoMinimo: 560 }

async function agrandar() {
  const ventana = getCurrentWindow()
  await ventana.setResizable(true)
  await ventana.setMaximizable(true)
  await ventana.setMinSize(new LogicalSize(VENTANA_DE_TRABAJO.anchoMinimo, VENTANA_DE_TRABAJO.altoMinimo))
  await ventana.setSize(new LogicalSize(VENTANA_DE_TRABAJO.ancho, VENTANA_DE_TRABAJO.alto))
  await ventana.center()
}

async function achicar() {
  const ventana = getCurrentWindow()
  if (await ventana.isMaximized()) await ventana.unmaximize()
  await ventana.setMinSize(null)
  await ventana.setSize(new LogicalSize(VENTANA_DE_ACCESO.ancho, VENTANA_DE_ACCESO.alto))
  await ventana.setResizable(false)
  await ventana.setMaximizable(false)
  await ventana.center()
}

/**
 * El programa abre en una ventana pequeña para entrar y crece al iniciar sesión; al cerrarla (o si vence) vuelve a la
 * pequeña. Al arrancar sin sesión no hace nada: la ventana ya nace pequeña. Fuera de Tauri no hace nada.
 */
export function useTamanoDeVentana(conSesion: boolean) {
  const anterior = useRef<boolean | null>(null)
  useEffect(() => {
    const primeraVez = anterior.current === null
    anterior.current = conSesion
    if (!isTauri() || (primeraVez && !conSesion)) return
    // Un fallo al cambiar el tamaño no debe impedir trabajar: la ventana se puede ajustar a mano.
    void (conSesion ? agrandar() : achicar()).catch(() => {})
  }, [conSesion])
}
