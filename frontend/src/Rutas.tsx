import { Navigate, Route, Routes } from 'react-router'
import { Estructura } from './estructura/Estructura'
import { Permiso } from './estructura/Permiso'
import { DESTINOS, RUTAS_ANTERIORES } from './navegacion/destinos'
import { Inicio } from './pages/inicio/Inicio'
import { NoEncontrada } from './pages/NoEncontrada'
import { ActualizarPrograma } from './pages/configuracion/ActualizarPrograma'
import { CopiasDeSeguridad } from './pages/configuracion/CopiasDeSeguridad'
import { DatosDelNegocio } from './pages/configuracion/DatosDelNegocio'
import { Abonos } from './pages/compras/Abonos'
import { ListaDeCompras } from './pages/compras/ListaDeCompras'
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
import { Seccion } from './components/Seccion'
import { CajaDeHoy } from './pages/caja/CajaDeHoy'
import { CajasAnteriores, DetalleDeCaja } from './pages/caja/CajasAnteriores'
import { Entregas } from './pages/consignacion/Entregas'
import { Locales } from './pages/consignacion/Locales'
import { PagosDeLocales } from './pages/consignacion/PagosDeLocales'
import { Reportes } from './pages/consignacion/Reportes'
import { DetalleDeDevolucion, Devoluciones } from './pages/venta/Devoluciones'
import { DetalleDeVenta } from './pages/venta/DetalleDeVenta'
import { ResumenDeVentas } from './pages/venta/ResumenDeVentas'
import { Vender } from './pages/venta/Vender'
import { Ventas } from './pages/venta/Ventas'

// Rutas de la aplicación con sesión abierta. El enrutador (por hash) lo pone App.tsx. Cada sección del menú es una
// ruta con sus pantallas dentro; las secciones solo del dueño aplican el permiso una vez, en la sección.
export function Rutas() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        <Route index element={<Inicio />} />
        <Route path="venta" element={<Seccion titulo={DESTINOS.venta.etiqueta} />}>
          <Route index element={<Navigate to="vender" replace />} />
          <Route path="vender" element={<Vender />} />
          <Route path="historial" element={<Ventas />} />
          <Route path="historial/:id" element={<DetalleDeVenta />} />
          <Route
            path="resumen"
            element={
              <Permiso destino={DESTINOS.resumenVentas} nivel={2}>
                <ResumenDeVentas />
              </Permiso>
            }
          />
          <Route path="devoluciones" element={<Devoluciones />} />
          <Route path="devoluciones/:id" element={<DetalleDeDevolucion />} />
        </Route>
        <Route path="inventario" element={<Seccion titulo={DESTINOS.inventario.etiqueta} />}>
          <Route index element={<Navigate to="productos" replace />} />
          <Route path="productos" element={<Productos />} />
          <Route path="movimientos" element={<Movimientos />} />
          <Route
            path="inicial"
            element={
              <Permiso destino={DESTINOS.inventarioInicial} nivel={2}>
                <InventarioInicial />
              </Permiso>
            }
          />
          <Route
            path="catalogo"
            element={
              <Permiso destino={DESTINOS.catalogo} nivel={2}>
                <Catalogo />
              </Permiso>
            }
          />
        </Route>
        <Route
          path="taller"
          element={
            <Permiso destino={DESTINOS.taller}>
              <Seccion titulo={DESTINOS.taller.etiqueta} />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="liquidacion" replace />} />
          <Route path="liquidacion" element={<LiquidacionDelDia />} />
          <Route path="historial" element={<HistorialDeLiquidaciones />} />
          <Route path="historial/:id" element={<DetalleDeLiquidacion />} />
          <Route path="mecanicos" element={<Mecanicos />} />
          <Route path="servicios" element={<TiposDeServicio />} />
        </Route>
        <Route
          path="compras"
          element={
            <Permiso destino={DESTINOS.compras}>
              <Seccion titulo={DESTINOS.compras.etiqueta} />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="lista" replace />} />
          <Route path="lista" element={<ListaDeCompras />} />
          <Route path="lista/nueva" element={<ListaDeCompras nueva />} />
          {/* La compra se abre en el panel amplio sobre la lista, no en otra página. */}
          <Route path="lista/:id" element={<ListaDeCompras />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="abonos" element={<Abonos />} />
        </Route>
        <Route
          path="caja"
          element={
            <Permiso destino={DESTINOS.caja}>
              <Seccion titulo={DESTINOS.caja.etiqueta} />
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
              <Seccion titulo={DESTINOS.consignacion.etiqueta} />
            </Permiso>
          }
        >
          <Route index element={<Navigate to="locales" replace />} />
          <Route path="locales" element={<Locales />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="reportes" element={<Reportes />} />
          <Route path="pagos" element={<PagosDeLocales />} />
        </Route>
        <Route path="configuracion" element={<Seccion titulo={DESTINOS.configuracion.etiqueta} />}>
          <Route index element={<Navigate to="negocio" replace />} />
          <Route path="negocio" element={<DatosDelNegocio />} />
          <Route
            path="usuarios"
            element={
              <Permiso destino={DESTINOS.usuarios} nivel={2}>
                <Usuarios />
              </Permiso>
            }
          />
          <Route
            path="respaldos"
            element={
              <Permiso destino={DESTINOS.respaldos} nivel={2}>
                <CopiasDeSeguridad />
              </Permiso>
            }
          />
          <Route
            path="actualizaciones"
            element={
              <Permiso destino={DESTINOS.actualizaciones} nivel={2}>
                <ActualizarPrograma />
              </Permiso>
            }
          />
        </Route>
        {Object.entries(RUTAS_ANTERIORES).map(([anterior, nueva]) => (
          <Route key={anterior} path={anterior} element={<Navigate to={nueva} replace />} />
        ))}
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  )
}
