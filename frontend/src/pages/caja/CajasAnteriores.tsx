import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { listarCajas, obtenerCaja } from '../../api/caja'
import { claves } from '../../api/consultas'
import { BarraDeFiltros } from '../../components/BarraDeFiltros'
import { BotonExportarExcel } from '../../components/BotonExportarExcel'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FiltroDePeriodo } from '../../components/FiltroDePeriodo'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Paginacion } from '../../components/Paginacion'
import { RegistroVacio } from '../../components/Registro'
import { Titulo } from '../../components/Titulo'
import { useConteo } from '../../hooks/useConteo'
import { MEDIDAS_DEL_LIBRO, useFilasQueCaben } from '../../hooks/useFilasQueCaben'
import { useHoy } from '../../hooks/useHoy'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { exportarExcel, todasLasPaginas } from '../../utilidades/excel'
import { formatearFechaHora } from '../../utilidades/fechas'
import { leerPeriodo, rangoDePeriodo, type Periodo } from '../../utilidades/periodos'
import { cuadreDeCaja } from './cuadreDeCaja'
import { DocumentoDeCaja, FichaDeCaja, VentanaDeCaja } from './FichaDeCaja'

/** Abre con todas las fechas, como antes: hay una caja por día y la de hoy está en Caja de hoy. */
const PERIODO_INICIAL: Periodo = 'todas'

/** Historial de cajas (solo el dueño): cada día de caja con su cierre, por día de apertura. */
export function CajasAnteriores() {
  const [params, setParams] = useSearchParams()
  const hoy = useHoy()
  const lista = useRef<HTMLElement>(null)
  const porPagina = useFilasQueCaben(lista, MEDIDAS_DEL_LIBRO)
  const pagina = Number(params.get('page'))
  const periodo = leerPeriodo(params, PERIODO_INICIAL)
  const filtros = {
    ...rangoDePeriodo(periodo, hoy, { desde: params.get('date_from') || undefined, hasta: params.get('date_to') || undefined }),
    page: Number.isInteger(pagina) && pagina > 0 ? pagina : undefined,
    page_size: porPagina,
  }

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  function elegirPeriodo(valor: Periodo) {
    cambiar({
      periodo: valor === PERIODO_INICIAL ? undefined : valor,
      ...(valor === 'fechas' ? {} : { date_from: undefined, date_to: undefined }),
    })
  }

  const cajas = useQuery({
    queryKey: [...claves.caja, 'historial', filtros],
    queryFn: ({ signal }) => listarCajas(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const seleccion = useSeleccion(cajas.data?.results, (caja) => caja.id)
  const todas = useConteo([...claves.caja, 'cuantas'], (signal) => listarCajas({ page_size: 1 }, signal))
  const [cajaAbierta, setCajaAbierta] = useState<{ id: number; abierta: string } | null>(null)

  async function exportarCajas() {
    const todas = await todasLasPaginas((page, page_size) => listarCajas({ ...filtros, page, page_size }))
    await exportarExcel(`cajas-${hoy}`, [
      {
        nombre: 'Cajas',
        encabezados: [
          'Apertura',
          'Abrió',
          'Cierre',
          'Cerró',
          'Base (COP)',
          'Esperado (COP)',
          'Contado (COP)',
          'Diferencia (COP)',
          'Resultado',
          'Nota del cierre',
        ],
        filas: todas.map((c) => [
          formatearFechaHora(c.opened_at),
          c.opened_by,
          c.closed_at ? formatearFechaHora(c.closed_at) : 'Abierta',
          c.closed_by ?? '',
          c.opening_cash,
          c.expected_cash,
          c.counted_cash ?? '',
          c.difference ?? '',
          cuadreDeCaja(c),
          c.closing_notes || '',
        ]),
      },
    ])
  }

  return (
    <div className="vista-libro">
      <EncabezadoDePantalla
        icono={DESTINOS.cajaHistorial.icono}
        titulo="Cajas anteriores"
        descripcion="Cada día de caja con su cierre. Elige una para ver su resumen."
        acciones={<BotonExportarExcel onExportar={exportarCajas} disabled={!cajas.isSuccess || cajas.data.count === 0} />}
      />
      <FranjaDeIndicadores
        indicadores={[{ rotulo: 'Cajas registradas', valor: String(todas.data ?? 0), cargando: todas.isPending, error: todas.isError }]}
      />
      <BarraDeFiltros>
        <FiltroDePeriodo
          periodo={periodo}
          desde={params.get('date_from') ?? ''}
          hasta={params.get('date_to') ?? ''}
          onPeriodo={elegirPeriodo}
          onDesde={(dia) => cambiar({ date_from: dia || undefined })}
          onHasta={(dia) => cambiar({ date_to: dia || undefined })}
        />
        {cajas.isSuccess && (
          <p role="status" className="barra-de-filtros__resultados">
            {cajas.data.count === 1 ? '1 caja' : `${cajas.data.count} cajas`}
          </p>
        )}
      </BarraDeFiltros>

      <div className="libro">
        <section ref={lista} className="libro__lista" aria-label="Lista de cajas">
          {cajas.isPending && <Cargando />}
          {cajas.isError && <ErrorDeCarga error={cajas.error} onReintentar={() => void cajas.refetch()} />}
          {cajas.isSuccess &&
            (cajas.data.count === 0 ? (
              <EstadoVacio
                icono={DESTINOS.cajaHistorial.icono}
                mensaje={periodo === PERIODO_INICIAL ? 'Todavía no hay cajas.' : 'Ninguna caja se abrió en esas fechas.'}
              />
            ) : (
              <div className="tabla-contenedor" tabIndex={0} onKeyDown={seleccion.alTeclear} aria-describedby="ayuda-cajas">
                <p id="ayuda-cajas" className="solo-lectores">
                  Usa las flechas para ver el resumen de cada caja.
                </p>
                <table className="tabla">
                  <caption className="solo-lectores">Cajas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Apertura</th>
                      <th scope="col">Cierre</th>
                      <th scope="col" className="tabla__numero libro__secundaria">
                        Inicial
                      </th>
                      <th scope="col" className="tabla__numero">
                        Esperado
                      </th>
                      <th scope="col" className="tabla__numero">
                        Contado
                      </th>
                      <th scope="col">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cajas.data.results.map((caja) => (
                      <tr
                        key={caja.id}
                        className="tabla__fila--elegible"
                        aria-selected={seleccion.elegido?.id === caja.id}
                        onClick={seleccion.alHacerClic(caja)}
                      >
                        <th scope="row">
                          <button
                            type="button"
                            className="boton-enlace"
                            aria-label={`Abrir la caja del ${formatearFechaHora(caja.opened_at)}`}
                            onClick={() => setCajaAbierta({ id: caja.id, abierta: caja.opened_at })}
                          >
                            {formatearFechaHora(caja.opened_at)}
                          </button>
                          <span className="tabla__detalle">Abrió {caja.opened_by}</span>
                        </th>
                        <td>
                          {caja.is_open ? (
                            <span className="etiqueta etiqueta--neutra">Abierta</span>
                          ) : caja.closed_at ? (
                            formatearFechaHora(caja.closed_at)
                          ) : (
                            '—'
                          )}
                          {caja.closed_by && <span className="tabla__detalle">Cerró {caja.closed_by}</span>}
                        </td>
                        <td className="tabla__numero libro__secundaria">{formatearPesos(caja.opening_cash)}</td>
                        <td className="tabla__numero">{formatearPesos(caja.expected_cash)}</td>
                        <td className="tabla__numero">{caja.counted_cash === null ? '—' : formatearPesos(caja.counted_cash)}</td>
                        <td className="libro__recortado" title={caja.closing_notes || undefined}>
                          {caja.is_open ? '—' : <span className={caja.difference ? 'libro__alerta' : undefined}>{cuadreDeCaja(caja)}</span>}
                          {caja.closing_notes && <span className="tabla__detalle">{caja.closing_notes}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {cajas.isSuccess && (
            <Paginacion
              etiqueta="Páginas de cajas"
              pagina={filtros.page ?? 1}
              total={cajas.data.count}
              tamano={porPagina}
              hayAnterior={Boolean(cajas.data.previous)}
              haySiguiente={Boolean(cajas.data.next)}
              onCambiar={(siguiente) => cambiar({ page: String(siguiente) })}
              mostrarSiempre
              textoAnterior="Atrás"
            />
          )}
        </section>
        {seleccion.elegido ? (
          <FichaDeCaja id={seleccion.elegido.id} abierta={seleccion.elegido.opened_at} onCerrar={seleccion.cerrar} />
        ) : (
          <RegistroVacio mensaje="Elige una caja para ver su resumen." />
        )}
      </div>
      {cajaAbierta && <VentanaDeCaja {...cajaAbierta} onCerrar={() => setCajaAbierta(null)} />}
    </div>
  )
}

/** Una caja anterior con su resumen y sus movimientos, desde una dirección directa. */
export function DetalleDeCaja() {
  const id = Number(useParams().id)
  const caja = useQuery({ queryKey: [...claves.caja, 'detalle', id], queryFn: ({ signal }) => obtenerCaja(id, signal) })
  if (caja.isPending) return <Cargando />
  if (caja.isError) return <ErrorDeCarga error={caja.error} onReintentar={() => void caja.refetch()} />
  return (
    <>
      <div className="barra-de-acciones">
        <Titulo nivel={2}>Caja del {formatearFechaHora(caja.data.opened_at)}</Titulo>
        <Link to="/caja/historial">Volver a las cajas</Link>
      </div>
      <DocumentoDeCaja caja={caja.data} />
    </>
  )
}
