import { useQuery } from '@tanstack/react-query'
import { House, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { listarCompras, listarProveedores } from '../../api/compras'
import { listarLocales } from '../../api/consignacion'
import { claves } from '../../api/consultas'
import { consultarLiquidacionDelDia } from '../../api/taller'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { useAreaAngosta } from '../../hooks/useAreaAngosta'
import { useAtajo } from '../../hooks/useAtajo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { useHoy } from '../../hooks/useHoy'
import { useDevolucionesDeHoy, usePanoramaDeVentas } from '../../hooks/usePanoramaDeVentas'
import { useProductosPorReponer } from '../../hooks/useProductosPorReponer'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearDiaLargo } from '../../utilidades/fechas'
import { CADA_MINUTO, horaDe } from './formato'
import { AvisoDeCajaAnterior, CuentasDelNegocio, FranjaDeVentas, TendenciaDeVentas } from './PanoramaPrincipal'
import { DevolucionesDeHoy, ExistenciasPorReponer, NecesitaTuAtencion, ResumenDeCaja } from './PanoramaSecundario'
import { TablaDeVentas } from './TablaDeVentas'

/** Panorama general del negocio (Opción A · «Panorama primero»). */
export function InicioDelDueno() {
  const hoy = useHoy()
  const angosta = useAreaAngosta()
  const navegar = useNavigate()
  useAtajo('n', () => navegar(DESTINOS.vender.ruta))

  const { actual: ventasActual, mesAnterior, intervaloMesAnterior } = usePanoramaDeVentas(hoy, CADA_MINUTO)
  const caja = useCajaActual(CADA_MINUTO)
  const existencias = useProductosPorReponer()
  const devoluciones = useDevolucionesDeHoy(hoy, CADA_MINUTO)
  const liquidacion = useQuery({
    queryKey: [...claves.liquidaciones, 'dia', hoy],
    queryFn: ({ signal }) => consultarLiquidacionDelDia(hoy, signal),
    refetchInterval: CADA_MINUTO,
  })
  const borradores = useQuery({
    queryKey: [...claves.compras, 'borradores-conteo'],
    queryFn: ({ signal }) => listarCompras({ status: 'draft', page_size: 1 }, signal),
    refetchInterval: CADA_MINUTO,
  })
  const proveedores = useQuery({
    queryKey: [...claves.proveedores, 'con-deuda'],
    queryFn: ({ signal }) => listarProveedores({ with_debt: true, include_inactive: true }, signal),
    refetchInterval: CADA_MINUTO,
  })
  const locales = useQuery({
    queryKey: [...claves.consignacion, 'locales', 'con-deuda'],
    queryFn: ({ signal }) => listarLocales({ with_debt: true, include_inactive: true }, signal),
    refetchInterval: CADA_MINUTO,
  })

  const todasLasFuentes = [ventasActual, mesAnterior, caja, existencias, devoluciones, liquidacion, borradores, proveedores, locales]
  const fuentesDelMinuto = [ventasActual, caja, devoluciones, liquidacion, borradores, proveedores, locales]
  const algunaFallo = todasLasFuentes.some((c) => c.isError)
  const todasListas = fuentesDelMinuto.every((c) => c.dataUpdatedAt > 0)
  const corteComun = !algunaFallo && todasListas ? Math.min(...fuentesDelMinuto.map((c) => c.dataUpdatedAt)) : 0
  const descripcion = algunaFallo
    ? `${formatearDiaLargo(hoy)} · Hay bloques sin actualizar`
    : corteComun > 0
      ? `${formatearDiaLargo(hoy)} · Datos a las ${horaDe(new Date(corteComun).toISOString())}`
      : formatearDiaLargo(hoy)

  const bloqueAtencion = <NecesitaTuAtencion existencias={existencias} liquidacion={liquidacion} borradores={borradores} />
  const bloqueTendencia = <TendenciaDeVentas hoy={hoy} actual={ventasActual} />
  const bloqueCuentas = <CuentasDelNegocio proveedores={proveedores} locales={locales} />
  const bloqueCaja = <ResumenDeCaja hoy={hoy} caja={caja} />
  const bloqueExistencias = <ExistenciasPorReponer existencias={existencias} />
  const bloqueDevoluciones = <DevolucionesDeHoy devoluciones={devoluciones} />
  const bloqueUltimasVentas = <TablaDeVentas titulo="Últimas ventas de hoy" cuantas={5} completa reciboEnVentana />

  return (
    <div className="inicio inicio--panorama">
      <div className="inicio-panorama__encabezado">
        <EncabezadoDePantalla
          nivel={1}
          icono={House}
          titulo="Así va tu negocio"
          descripcion={descripcion}
          acciones={
            <>
              <Link to={DESTINOS.comprasLista.ruta} className="boton boton--auto boton--secundario">
                Recibir compra
              </Link>
              <Link to={DESTINOS.vender.ruta} className="boton boton--auto boton--con-icono" aria-keyshortcuts="Control+N">
                <Plus aria-hidden="true" size={16} />
                Nueva venta
                <kbd className="atajo-visible" aria-hidden="true">
                  Ctrl+N
                </kbd>
              </Link>
            </>
          }
        />
      </div>
      <div className="inicio-panorama__cuerpo">
        <div className="inicio-panorama__interior">
          <AvisoDeCajaAnterior hoy={hoy} caja={caja} />
          <FranjaDeVentas
            hoy={hoy}
            actual={ventasActual}
            mesAnterior={mesAnterior}
            intervaloMesAnterior={intervaloMesAnterior}
          />
          {angosta ? (
            <div className="inicio-panorama__una-columna">
              {bloqueAtencion}
              {bloqueTendencia}
              {bloqueCuentas}
              {bloqueCaja}
              {bloqueExistencias}
              {bloqueDevoluciones}
              {bloqueUltimasVentas}
            </div>
          ) : (
            <div className="inicio-panorama__columnas">
              <div className="inicio-panorama__principal">
                {bloqueTendencia}
                {bloqueCuentas}
                {bloqueUltimasVentas}
              </div>
              <div className="inicio-panorama__secundaria">
                {bloqueAtencion}
                {bloqueCaja}
                {bloqueExistencias}
                {bloqueDevoluciones}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
