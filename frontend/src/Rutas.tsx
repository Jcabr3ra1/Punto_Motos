import { Navigate, Route, Routes } from 'react-router'
import { Estructura } from './estructura/Estructura'
import { Permiso } from './estructura/Permiso'
import { DESTINOS } from './navegacion/destinos'
import { EnConstruccion } from './pages/EnConstruccion'
import { Inicio } from './pages/Inicio'
import { NoEncontrada } from './pages/NoEncontrada'
import { Configuracion } from './pages/configuracion/Configuracion'

// Rutas de la aplicación con sesión abierta. El enrutador (por hash) lo pone App.tsx.
export function Rutas() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="productos" element={<EnConstruccion titulo="Productos" />} />
        <Route path="configuracion" element={<Configuracion />}>
          <Route index element={<Navigate to="negocio" replace />} />
          <Route path="negocio" element={<EnConstruccion titulo="Datos del negocio" nivel={2} />} />
          <Route
            path="catalogo"
            element={
              <Permiso destino={DESTINOS.catalogo} nivel={2}>
                <EnConstruccion titulo="Tipos, marcas y motos" nivel={2} />
              </Permiso>
            }
          />
          <Route
            path="usuarios"
            element={
              <Permiso destino={DESTINOS.usuarios} nivel={2}>
                <EnConstruccion titulo="Usuarios" nivel={2} />
              </Permiso>
            }
          />
        </Route>
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}
