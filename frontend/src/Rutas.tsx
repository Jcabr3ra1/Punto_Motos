import { Navigate, Route, Routes } from 'react-router'
import { Estructura } from './estructura/Estructura'
import { Permiso } from './estructura/Permiso'
import { DESTINOS, MENU_CAJA, MENU_CONSIGNACION, MENU_TALLER, MENU_VENTA } from './navegacion/destinos'
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
import { Mecanicos } from './pages/configuracion/taller/Mecanicos'
import { TiposDeServicio } from './pages/configuracion/taller/TiposDeServicio'
import { DetalleDeLiquidacion, HistorialDeLiquidaciones } from './pages/taller/HistorialDeLiquidaciones'
import { LiquidacionDelDia } from './pages/taller/LiquidacionDelDia'
import { InventarioInicial } from './pages/inventario/InventarioInicial'
import { Movimientos } from './pages/inventario/Movimientos'
import { Productos } from './pages/productos/Productos'
import { SeccionConPestanas } from './components/SeccionConPestanas'
import { CajaDeHoy } from './pages/caja/CajaDeHoy'
import { CajasAnteriores, DetalleDeCaja } from './pages/caja/CajasAnteriores'
import { Entregas } from './pages/consignacion/Entregas'
import { Locales } from './pages/consignacion/Locales'
import { PagosDeLocales } from './pages/consignacion/PagosDeLocales'
import { Reportes } from './pages/consignacion/Reportes'
import { DetalleDeVenta } from './pages/venta/DetalleDeVenta'
import { Vender } from './pages/venta/Vender'
import { Ventas } from './pages/venta/Ventas'

// Rutas de la aplicación con sesión abierta. El enrutador (por hash) lo pone App.tsx.
export function Rutas() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="venta" element={<SeccionConPestanas titulo="Venta" destinos={MENU_VENTA} />}>
          <Route index element={<Navigate to="vender" replace />} />
          <Route path="vender" element={<Vender />} />
          <Route path="historial" element={<Ventas />} />
          <Route path="historial/:id" element={<DetalleDeVenta />} />
        </Route>
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
        <Route
          path="taller"
          element={
            <Permiso destino={DESTINOS.taller}>
              <SeccionConPestanas titulo="Taller" destinos={MENU_TALLER} />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="liquidacion" replace />} />
          <Route path="liquidacion" element={<LiquidacionDelDia />} />
          <Route path="historial" element={<HistorialDeLiquidaciones />} />
          <Route path="historial/:id" element={<DetalleDeLiquidacion />} />
        </Route>
        <Route
          path="caja"
          element={
            <Permiso destino={DESTINOS.caja}>
              <SeccionConPestanas titulo="Caja" destinos={MENU_CAJA} />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="actual" replace />} />
          <Route path="actual" element={<CajaDeHoy />} />
          <Route path="historial" element={<CajasAnteriores />} />
          <Route path="historial/:id" element={<DetalleDeCaja />} />
        </Route>
        <Route
          path="consignacion"
          element={
            <Permiso destino={DESTINOS.consignacion}>
              <SeccionConPestanas titulo="Consignación" destinos={MENU_CONSIGNACION} />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="locales" replace />} />
          <Route path="locales" element={<Locales />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="pagos" element={<PagosDeLocales />} />
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
            path="servicios"
            element={
              <Permiso destino={DESTINOS.tiposDeServicio} nivel={2}>
                <TiposDeServicio />
              </Permiso>
            }
          />
          <Route
            path="mecanicos"
            element={
              <Permiso destino={DESTINOS.mecanicos} nivel={2}>
                <Mecanicos />
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
