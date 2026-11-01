import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { InicioProvisional } from './pages/InicioProvisional'
import { AsistenteDelDueno } from './pages/acceso/AsistenteDelDueno'
import { InicioDeSesion } from './pages/acceso/InicioDeSesion'
import { Conectando, SinConexion } from './pages/acceso/PantallaDeConexion'

function Pantalla() {
  const { estado, reintentar } = useAuth()

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
      return <InicioProvisional usuario={estado.usuario} />
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Pantalla />
    </AuthProvider>
  )
}
