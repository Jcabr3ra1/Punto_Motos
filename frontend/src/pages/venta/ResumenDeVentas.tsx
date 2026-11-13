import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { claves } from '../../api/consultas'
import { consultarResumenDeVentas } from '../../api/ventas'
import { BarraDeFiltros, ListaDeFiltro } from '../../components/BarraDeFiltros'
import { BotonExportarExcel } from '../../components/BotonExportarExcel'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Titulo } from '../../components/Titulo'
import { useHoy } from '../../hooks/useHoy'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { exportarExcel } from '../../utilidades/excel'
import { formatearNumero } from '../../utilidades/numeros'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { sinTildes } from '../../utilidades/texto'

/**
 * Resumen neto de ventas (solo el dueño): unidades y recaudo por tipo de producto,
 * por servicio y por producto individual, descontando anulaciones y devoluciones.
 */
export function ResumenDeVentas() {
  const [params, setParams] = useSearchParams()
  const hoy = useHoy()
  const periodo = leerPeriodo(params)
  const desde = params.get('date_from') ?? ''
  const hasta = params.get('date_to') ?? ''
  const [tipoElegido, setTipoElegido] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    setParams(siguiente, { replace: true })
  }

  function elegirPeriodo(valor: Periodo) {
    cambiar({
      periodo: valor === 'hoy' ? undefined : valor,
      ...(valor === 'fechas' ? {} : { date_from: undefined, date_to: undefined }),
    })
  }

  const rango =
    periodo === 'todas'
      ? { date_from: '2000-01-01', date_to: hoy }
      : rangoDePeriodo(periodo, hoy, { desde: desde || undefined, hasta: hasta || undefined })

  const consulta = useQuery({
    queryKey: [...claves.ventas, 'resumen', rango],
    queryFn: ({ signal }) => consultarResumenDeVentas(rango, signal),
    placeholderData: keepPreviousData,
  })

  const datos = consulta.data
  const texto = sinTildes(busqueda.trim().toLowerCase())
  const productosFiltrados = (datos?.products ?? []).filter((p) => {
    if (tipoElegido !== null && p.category_id !== tipoElegido) return false
    if (!texto) return true
    return sinTildes(p.name.toLowerCase()).includes(texto) || sinTildes(p.code.toLowerCase()).includes(texto)
  })

  async function exportarResumen() {
    if (!datos) return
    const nombre = datos.date_from === datos.date_to ? `resumen-ventas-${datos.date_from}` : `resumen-ventas-${datos.date_from}-a-${datos.date_to}`
    await exportarExcel(nombre, [
      {
        nombre: 'Resumen',
        encabezados: ['Concepto', 'Cantidad', 'Total (COP)'],
        filas: [
          ['Productos vendidos', datos.totals.products_quantity, datos.totals.products_total],
          ['Servicios realizados', datos.totals.services_count, datos.totals.services_total],
          ['Total recaudado', '', datos.totals.grand_total],
        ],
      },
      {
        nombre: 'Por tipo de producto',
        encabezados: ['Tipo', 'Unidades', 'Recaudado (COP)'],
        filas: datos.categories.map((c) => [c.name, c.quantity, c.total]),
      },
      {
        nombre: 'Por servicio',
        encabezados: ['Servicio', 'Cantidad', 'Recaudado (COP)'],
        filas: datos.services.map((s) => [s.name, s.count, s.total]),
      },
      {
        nombre: 'Por producto',
        encabezados: ['Código', 'Producto', 'Tipo', 'Unidades', 'Recaudado (COP)'],
        filas: productosFiltrados.map((p) => [p.code, p.name, p.category_name, p.quantity, p.total]),
      },
    ])
  }

  return (
    <div className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.resumenVentas.icono}
        titulo="Resumen de ventas"
        descripcion="Totales netos por tipo de producto, servicio y producto. Descuenta anulaciones y devoluciones."
        acciones={<BotonExportarExcel onExportar={exportarResumen} disabled={!datos} />}
      />
      <FranjaDeIndicadores
        indicadores={[
          {
            rotulo: 'Total recaudado',
            valor: formatearPesos(datos?.totals.grand_total ?? 0),
            cargando: consulta.isPending,
            error: consulta.isError,
          },
          {
            rotulo: `Productos (${formatearNumero(datos?.totals.products_quantity ?? 0)} uds)`,
            valor: formatearPesos(datos?.totals.products_total ?? 0),
            cargando: consulta.isPending,
            error: consulta.isError,
          },
          {
            rotulo: `Servicios (${formatearNumero(datos?.totals.services_count ?? 0)})`,
            valor: formatearPesos(datos?.totals.services_total ?? 0),
            cargando: consulta.isPending,
            error: consulta.isError,
          },
        ]}
      />
      <BarraDeFiltros
        busqueda={{
          etiqueta: 'Buscar producto',
          placeholder: 'Código o nombre del producto',
          valor: busqueda,
          onCambiar: setBusqueda,
        }}
      >
        <FiltroDePeriodo
          periodo={periodo}
          desde={desde}
          hasta={hasta}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        {datos && datos.categories.length > 0 && (
          <ListaDeFiltro
            etiqueta="Tipo"
            valor={tipoElegido === null ? '' : String(tipoElegido)}
            onCambiar={(valor) => setTipoElegido(valor ? Number(valor) : null)}
          >
            <option value="">Todos</option>
            {datos.categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </ListaDeFiltro>
        )}
      </BarraDeFiltros>

      {consulta.isPending && <Cargando />}
      {consulta.isError && <ErrorDeCarga error={consulta.error} onReintentar={() => void consulta.refetch()} />}
      {datos &&
        datos.categories.length === 0 &&
        datos.services.length === 0 &&
        datos.products.length === 0 && (
          <EstadoVacio icono={ClipboardCheck} mensaje="No hay ventas vigentes en ese período." />
        )}

      {datos && (datos.categories.length > 0 || datos.services.length > 0) && (
        <div className="libro">
          <section className="libro__lista" aria-label="Resumen por tipo y servicio">
            <Titulo nivel={2}>Por tipo de producto</Titulo>
            {datos.categories.length === 0 ? (
              <p className="texto-suave">No se vendieron productos en este período.</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Ventas por tipo de producto</caption>
                  <thead>
                    <tr>
                      <th scope="col">Tipo</th>
                      <th scope="col" className="tabla__numero">Unidades</th>
                      <th scope="col" className="tabla__numero">Recaudado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.categories.map((cat) => (
                      <tr
                        key={cat.id}
                        className="tabla__fila--elegible"
                        aria-selected={tipoElegido === cat.id}
                        onClick={() => setTipoElegido((actual) => (actual === cat.id ? null : cat.id))}
                      >
                        <th scope="row">{cat.name}</th>
                        <td className="tabla__numero">{formatearNumero(cat.quantity)}</td>
                        <td className="tabla__numero">{formatearPesos(cat.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Titulo nivel={2}>Por servicio</Titulo>
            {datos.services.length === 0 ? (
              <p className="texto-suave">No se cobraron servicios en este período.</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Ventas por servicio</caption>
                  <thead>
                    <tr>
                      <th scope="col">Servicio</th>
                      <th scope="col" className="tabla__numero">Cantidad</th>
                      <th scope="col" className="tabla__numero">Recaudado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.services.map((srv) => (
                      <tr key={srv.id}>
                        <th scope="row">{srv.name}</th>
                        <td className="tabla__numero">{formatearNumero(srv.count)}</td>
                        <td className="tabla__numero">{formatearPesos(srv.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="libro__lista" aria-label="Resumen por producto">
            <Titulo nivel={2}>
              Por producto
              {tipoElegido !== null && (
                <>
                  {' · '}
                  {datos.categories.find((c) => c.id === tipoElegido)?.name}
                </>
              )}
            </Titulo>
            {productosFiltrados.length === 0 ? (
              <p className="texto-suave">Ningún producto coincide con el filtro.</p>
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Ventas por producto</caption>
                  <thead>
                    <tr>
                      <th scope="col">Producto</th>
                      <th scope="col" className="libro__secundaria">Tipo</th>
                      <th scope="col" className="tabla__numero">Unidades</th>
                      <th scope="col" className="tabla__numero">Recaudado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((prod) => (
                      <tr key={prod.id}>
                        <th scope="row">
                          {prod.name}
                          <span className="tabla__detalle">{prod.code}</span>
                        </th>
                        <td className="libro__secundaria">{prod.category_name}</td>
                        <td className="tabla__numero">{formatearNumero(prod.quantity)}</td>
                        <td className="tabla__numero">{formatearPesos(prod.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
