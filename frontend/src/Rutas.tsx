import { Navigate, Route, Routes } from 'react-router'
import { Estructura } from './estructura/Estructura'
import { Permiso } from './estructura/Permiso'
import { DESTINOS } from './navegacion/destinos'
import { Inicio } from './pages/Inicio'
import { NoEncontrada } from './pages/NoEncontrada'
import { Configuracion } from './pages/configuracion/Configuracion'
import { DatosDelNegocio } from './pages/configuracion/DatosDelNegocio'
import { Catalogo } from './pages/configuracion/catalogo/Catalogo'
import { Usuarios } from './pages/configuracion/usuarios/Usuarios'
import { InventarioInicial } from './pages/inventario/InventarioInicial'
import { Productos } from './pages/productos/Productos'
import { Venta } from './pages/venta/Venta'

// Rutas de la aplicación con sesión abierta. El enrutador (por hash) lo pone App.tsx.
export function Rutas() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="venta" element={<Venta />} />
        <Route path="productos" element={<Productos />} />
        <Route
          path="inventario-inicial"
          element={
            <Permiso destino={DESTINOS.inventarioInicial}>
              <InventarioInicial />
            </Permiso>
          }
        />
        <Route path="configuracion" element={<Configuracion />}>
          <Route index element={<Navigate to="negocio" replace />} />
          <Route path="negocio" element={<DatosDelNegocio />} />
          <Route
            path="catalogo"
            element={
              <Permiso destino={DESTINOS.catalogo} nivel={2}>
                <Catalogo />
              </Permiso>
            }
          />
          <Route
            path="usuarios"
            element={
              <Permiso destino={DESTINOS.usuarios} nivel={2}>
                <Usuarios />
              </Permiso>
            }
          />
        </Route>
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}
