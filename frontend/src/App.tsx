import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { HashRouter } from 'react-router'
import { crearClienteDeConsultas } from './api/consultas'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { useTamanoDeVentana } from './desktop/useTamanoDeVentana'
import { Rutas } from './Rutas'
import { AsistenteDelDueno } from './pages/acceso/AsistenteDelDueno'
import { InicioDeSesion } from './pages/acceso/InicioDeSesion'
import { Conectando, SinConexion } from './pages/acceso/PantallaDeConexion'

function Pantalla() {
  const { estado, reintentar } = useAuth()
  useTamanoDeVentana(estado.fase === 'con-sesion')

  switch (estado.fase) {
    case 'conectando':
      return <Conectando />
    case 'sin-conexion':
      return <SinConexion mensaje={estado.mensaje} onReintentar={reintentar} />
    case 'primer-uso':
      return <AsistenteDelDueno />
    case 'sin-sesion':
      return <InicioDeSesion />
    case 'con-sesion':
      // Rutas por hash: en la app de escritorio no hay servidor que responda a /productos.
      return (
        <HashRouter>
          <Rutas />
        </HashRouter>
      )
  }
}

export default function App() {
  const [clienteDeConsultas] = useState(crearClienteDeConsultas)
  return (
    <QueryClientProvider client={clienteDeConsultas}>
      <AuthProvider>
        <Pantalla />
      </AuthProvider>
    </QueryClientProvider>
  )
}
