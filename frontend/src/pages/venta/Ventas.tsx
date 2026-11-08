import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, ReceiptText } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import { listarMecanicos } from '../../api/taller'
import { listarVentas, type FiltrosDeVentas } from '../../api/ventas'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { useAtajo } from '../../hooks/useAtajo'
import { useConteo } from '../../hooks/useConteo'
import { useSeleccion } from '../../hooks/useSeleccion'
import { useVentasDeHoy } from '../../hooks/useVentasDeHoy'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora, hoyEnColombia } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { FichaDeVenta } from './FichaDeVenta'

function leerFiltros(params: URLSearchParams): FiltrosDeVentas {
  const numero = Number(params.get('number'))
  const mecanico = Number(params.get('mechanic'))
  const pagina = Number(params.get('page'))
  const anuladas = params.get('voided')
  return {
    number: Number.isInteger(numero) && numero > 0 ? numero : undefined,
    mechanic: Number.isInteger(mecanico) && mecanico > 0 ? mecanico : undefined,
    voided: anuladas === 'true' ? true : anuladas === 'false' ? false : undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
  }
}

// Historial de ventas (todos los roles), de la más reciente a la más antigua.
export function Ventas() {
  const [params, setParams] = useSearchParams()
  const filtros = leerFiltros(params)

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  const mecanicos = useQuery({ queryKey: claves.mecanicos(true), queryFn: ({ signal }) => listarMecanicos(true, signal) })
  const ventas = useQuery({
    queryKey: [...claves.ventas, filtros],
    queryFn: ({ signal }) => listarVentas(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const hayFiltros = Boolean(filtros.number || filtros.mechanic || filtros.voided !== undefined || filtros.date_from || filtros.date_to)
  const seleccion = useSeleccion(ventas.data?.results, (venta) => venta.id)
  const navegar = useNavigate()
  useAtajo('n', () => navegar(DESTINOS.vender.ruta))

  const hoy = hoyEnColombia()
  const deHoy = useVentasDeHoy()
  const anuladas = useConteo([...claves.ventas, 'anuladas', hoy], (signal) =>
    listarVentas({ date_from: hoy, date_to: hoy, voided: true, page_size: 1 }, signal),
  )

  return (
    <>
      <EncabezadoDePantalla
        icono={DESTINOS.ventas.icono}
        titulo="Ventas"
        descripcion="Lo vendido, de lo más reciente a lo más antiguo. Elige una venta para ver su detalle."
        acciones={
          <Link to={DESTINOS.vender.ruta} className="boton boton--auto boton--con-icono" aria-keyshortcuts="Control+N">
            <Plus aria-hidden="true" size={16} />
            Nueva venta
            <kbd className="atajo-visible" aria-hidden="true">Ctrl+N</kbd>
          </Link>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Ventas de hoy', valor: formatearNumero(deHoy.data?.cantidad ?? 0), cargando: deHoy.isPending, error: deHoy.isError },
          { rotulo: 'Total de hoy', valor: formatearPesos(deHoy.data?.total ?? 0), cargando: deHoy.isPending, error: deHoy.isError },
          { rotulo: 'Anuladas hoy', valor: formatearNumero(anuladas.data ?? 0), cargando: anuladas.isPending, error: anuladas.isError },
        ]}
      />
      <div className="filtros" role="search" aria-label="Filtrar ventas">
        <Campo
          etiqueta="N.º de recibo"
          type="number"
          inputMode="numeric"
          min={1}
          value={filtros.number ?? ''}
          onChange={(e) => cambiar({ number: e.target.value || undefined })}
        />
        <CampoSelector
          etiqueta="Mecánico"
          value={filtros.mechanic ? String(filtros.mechanic) : ''}
          onChange={(e) => cambiar({ mechanic: e.target.value || undefined })}
          opciones={[{ valor: '', texto: 'Todos' }, ...(mecanicos.data ?? []).map((m) => ({ valor: String(m.id), texto: m.name }))]}
        />
        <CampoSelector
          etiqueta="Estado"
          value={filtros.voided === undefined ? '' : String(filtros.voided)}
          onChange={(e) => cambiar({ voided: e.target.value || undefined })}
          opciones={[
            { valor: '', texto: 'Todas' },
            { valor: 'false', texto: 'Vigentes' },
            { valor: 'true', texto: 'Anuladas' },
          ]}
        />
        <Campo
          etiqueta="Desde"
          type="date"
          value={filtros.date_from ?? ''}
          onChange={(e) => cambiar({ date_from: e.target.value || undefined })}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={filtros.date_to ?? ''}
          onChange={(e) => cambiar({ date_to: e.target.value || undefined })}
        />
      </div>

      {ventas.isPending && <Cargando />}
      {ventas.isError && <ErrorDeCarga error={ventas.error} onReintentar={() => void ventas.refetch()} />}
      {ventas.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {ventas.data.count === 1 ? '1 venta' : `${formatearNumero(ventas.data.count)} ventas`}
          </p>
          {ventas.data.count === 0 ? (
            <EstadoVacio icono={ReceiptText} mensaje={hayFiltros ? 'Ninguna venta coincide con los filtros.' : 'Todavía no hay ventas.'} />
          ) : (
            <div className={seleccion.elegido ? 'con-ficha' : undefined}>
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-ventas">
                <p id="ayuda-ventas" className="solo-lectores">
                  Usa las flechas para ver el detalle de cada venta.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Ventas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recibo</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Cliente</th>
                      <th scope="col" className="tabla__numero">
                        Total
                      </th>
                      <th scope="col">Vendió</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventas.data.results.map((venta) => (
                      <tr
                        key={venta.id}
                        className={`tabla__fila--elegible${venta.is_voided ? ' tabla__fila--inactiva' : ''}`}
                        aria-selected={seleccion.elegido?.id === venta.id}
                        onClick={() => seleccion.elegir(venta)}
                      >
                        <th scope="row">
                          <Link to={`/venta/historial/${venta.id}`} className="tabla__codigo">
                            N.º {venta.number}
                          </Link>
                          {venta.is_voided && <span className="etiqueta etiqueta--peligro">Anulada</span>}
                          {venta.services_count > 0 && (
                            <span className="tabla__detalle">
                              {venta.services_count === 1 ? '1 servicio' : `${venta.services_count} servicios`}
                            </span>
                          )}
                        </th>
                        <td className="tabla__nowrap">{formatearFechaHora(venta.created_at)}</td>
                        <td>
                          {venta.customer?.name ?? 'Sin cliente'}
                          {venta.customer?.phone && <span className="tabla__detalle">{venta.customer.phone}</span>}
                        </td>
                        <td className="tabla__numero">{formatearPesos(venta.total)}</td>
                        <td>{venta.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                etiqueta="Páginas de ventas"
                pagina={filtros.page ?? 1}
                total={ventas.data.count}
                hayAnterior={Boolean(ventas.data.previous)}
                haySiguiente={Boolean(ventas.data.next)}
                onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              />
              {seleccion.elegido && (
                <FichaDeVenta id={seleccion.elegido.id} numero={seleccion.elegido.number} onCerrar={seleccion.cerrar} />
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
