import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { listarCajas, obtenerCaja } from '../../api/caja'
import { claves } from '../../api/consultas'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { EstadoVacio } from '../../components/EstadoVacio'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { Titulo } from '../../components/Titulo'
import { useSeleccion } from '../../hooks/useSeleccion'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { FichaDeCaja } from './FichaDeCaja'
import { CifrasDeCaja, MovimientosDeCaja, ResumenPorTipo } from './ResumenDeCaja'

/** Historial de cajas (solo el dueño). */
export function CajasAnteriores() {
  const [pagina, setPagina] = useState(1)
  const cajas = useQuery({
    queryKey: [...claves.caja, 'historial', pagina],
    queryFn: ({ signal }) => listarCajas({ page: pagina }, signal),
    placeholderData: keepPreviousData,
  })
  const seleccion = useSeleccion(cajas.data?.results, (caja) => caja.id)

  return (
    <>
      <EncabezadoDePantalla
        icono={DESTINOS.cajaHistorial.icono}
        titulo="Cajas anteriores"
        descripcion="Cada día de caja con su cierre. Elige una para ver su resumen."
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Cajas registradas', valor: String(cajas.data?.count ?? 0), cargando: cajas.isPending, error: cajas.isError },
        ]}
      />
      {cajas.isPending && <Cargando />}
      {cajas.isError && <ErrorDeCarga error={cajas.error} onReintentar={() => void cajas.refetch()} />}
      {cajas.isSuccess &&
        (cajas.data.count === 0 ? (
          <EstadoVacio icono={DESTINOS.cajaHistorial.icono} mensaje="Todavía no hay cajas." />
        ) : (
          <div className={seleccion.elegido ? 'con-ficha' : undefined}>
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
                    <th scope="col" className="tabla__numero">
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
                        <Link to={`/caja/historial/${caja.id}`}>{formatearFechaHora(caja.opened_at)}</Link>
                        <span className="tabla__detalle">Abrió {caja.opened_by}</span>
                      </th>
                      <td>{caja.is_open ? <span className="etiqueta etiqueta--neutra">Abierta</span> : caja.closed_at ? formatearFechaHora(caja.closed_at) : '—'}</td>
                      <td className="tabla__numero">{formatearPesos(caja.opening_cash)}</td>
                      <td className="tabla__numero">{formatearPesos(caja.expected_cash)}</td>
                      <td className="tabla__numero">{caja.counted_cash === null ? '—' : formatearPesos(caja.counted_cash)}</td>
                      <td>
                        {caja.difference === null
                          ? '—'
                          : caja.difference === 0
                            ? 'Cuadró'
                            : caja.difference > 0
                              ? `Sobraron ${formatearPesos(caja.difference)}`
                              : `Faltaron ${formatearPesos(-caja.difference)}`}
                        {caja.closing_notes && <span className="tabla__detalle">{caja.closing_notes}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              etiqueta="Páginas de cajas"
              pagina={pagina}
              total={cajas.data.count}
              hayAnterior={Boolean(cajas.data.previous)}
              haySiguiente={Boolean(cajas.data.next)}
              onCambiar={setPagina}
            />
            {seleccion.elegido && (
              <FichaDeCaja id={seleccion.elegido.id} abierta={seleccion.elegido.opened_at} onCerrar={seleccion.cerrar} />
            )}
          </div>
        ))}
    </>
  )
}

/** Una caja anterior con su resumen y sus movimientos. */
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
      <p className="texto-suave">
        Abrió {caja.data.opened_by}
        {caja.data.closed_at && ` · Cerró ${caja.data.closed_by} el ${formatearFechaHora(caja.data.closed_at)}`}
        {caja.data.closing_notes && ` · ${caja.data.closing_notes}`}
      </p>
      <CifrasDeCaja caja={caja.data} />
      <Titulo nivel={3}>Resumen</Titulo>
      <ResumenPorTipo caja={caja.data} />
      <MovimientosDeCaja cajaId={caja.data.id} />
    </>
  )
}
