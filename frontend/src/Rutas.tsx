import { Navigate, Route, Routes } from 'react-router'
import { Estructura } from './estructura/Estructura'
import { Permiso } from './estructura/Permiso'
import { DESTINOS } from './navegacion/destinos'
import { Inicio } from './pages/Inicio'
import { NoEncontrada } from './pages/NoEncontrada'
import { Configuracion } from './pages/configuracion/Configuracion'
import { DatosDelNegocio } from './pages/configuracion/DatosDelNegocio'
import { Abonos } from './pages/compras/Abonos'
import { Compras } from './pages/compras/Compras'
import { DetalleDeCompra } from './pages/compras/DetalleDeCompra'
import { ListaDeCompras } from './pages/compras/ListaDeCompras'
import { NuevaCompra } from './pages/compras/NuevaCompra'
import { Proveedores } from './pages/compras/Proveedores'
import { Catalogo } from './pages/configuracion/catalogo/Catalogo'
import { Usuarios } from './pages/configuracion/usuarios/Usuarios'
import { InventarioInicial } from './pages/inventario/InventarioInicial'
import { Movimientos } from './pages/inventario/Movimientos'
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
        <Route path="inventario/movimientos" element={<Movimientos />} />
        <Route
          path="inventario-inicial"
          element={
            <Permiso destino={DESTINOS.inventarioInicial}>
              <InventarioInicial />
            </Permiso>
          }
        />
        {/* Todo Compras es solo del dueño: el permiso se aplica una vez, en la sección. */}
        <Route
          path="compras"
          element={
            <Permiso destino={DESTINOS.compras}>
              <Compras />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="lista" replace />} />
          <Route path="lista" element={<ListaDeCompras />} />
          <Route path="lista/nueva" element={<NuevaCompra />} />
          <Route path="lista/:id" element={<DetalleDeCompra />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="abonos" element={<Abonos />} />
        </Route>
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
