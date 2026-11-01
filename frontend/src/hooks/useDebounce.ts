import { useEffect, useState } from 'react'

/** Devuelve `valor` solo después de que deje de cambiar durante `ms` milisegundos. */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [retrasado, setRetrasado] = useState(valor)
  useEffect(() => {
    const temporizador = setTimeout(() => setRetrasado(valor), ms)
    return () => clearTimeout(temporizador)
  }, [valor, ms])
  return retrasado
}
