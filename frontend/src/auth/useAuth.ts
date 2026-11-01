import { useContext } from 'react'
import { ContextoAuth } from './contexto'

export function useAuth(): ContextoAuth {
  const contexto = useContext(ContextoAuth)
  if (!contexto) throw new Error('useAuth debe usarse dentro de <AuthProvider>.')
  return contexto
}
