import { useEffect, useState } from 'react'
import { hoyEnColombia } from '../utilidades/fechas'

/** Cada cuánto se mira si ya cambió el día. */
const CADA_MINUTO = 60_000

/**
 * El día de hoy en Colombia (`AAAA-MM-DD`) que se actualiza solo al pasar la medianoche, para que las consultas de
 * «hoy» y «este mes» no se queden en el día anterior si el programa sigue abierto.
 */
export function useHoy(): string {
  const [hoy, setHoy] = useState(hoyEnColombia)
  useEffect(() => {
    const temporizador = setInterval(() => setHoy(hoyEnColombia()), CADA_MINUTO)
    return () => clearInterval(temporizador)
  }, [])
  return hoy
}
