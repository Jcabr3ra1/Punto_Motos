import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { claves } from '../../api/consultas'
import { obtenerLiquidacion } from '../../api/taller'
import { Ficha } from '../../components/Ficha'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia } from '../../utilidades/fechas'

/** Detalle de una liquidación junto al historial: lo pagado y los servicios que cubrió. */
export function FichaDeLiquidacion({ id, mecanico, onCerrar }: { id: number; mecanico: string; onCerrar: () => void }) {
  const liquidacion = useQuery({
    queryKey: [...claves.liquidaciones, 'detalle', id],
    queryFn: ({ signal }) => obtenerLiquidacion(id, signal),
  })
  const datos = liquidacion.data
  return (
    <Ficha
      titulo={`Liquidación de ${mecanico}`}
      modulo="Historial de liquidaciones"
      onCerrar={onCerrar}
      acciones={
        <Link to={`${DESTINOS.historialDeLiquidaciones.ruta}/${id}`} className="boton boton--auto">
          Abrir la hoja
        </Link>
      }
    >
      {liquidacion.isPending && <p className="texto-suave">Cargando la liquidación…</p>}
      {liquidacion.isError && <p className="texto-suave">No se pudo cargar la liquidación.</p>}
      {datos && (
        <>
          <p className="ficha__cifra">
            {formatearPesos(datos.amount)}
            <span className="ficha__cifra-detalle">
              {datos.percentage} % de {formatearPesos(datos.labor_total)} · {datos.method_label}
            </span>
          </p>
          <dl className="ficha__datos">
            <div>
              <dt>Día liquidado</dt>
              <dd>{formatearDia(datos.date)}</dd>
            </div>
            <div>
              <dt>Descuentos</dt>
              <dd>{datos.deductions_total > 0 ? formatearPesos(datos.deductions_total) : '—'}</dd>
            </div>
          </dl>
          <h4 className="ficha__subtitulo">Servicios</h4>
          <ul className="ficha__lineas">
            {datos.services.map((servicio) => (
              <li key={servicio.id}>
                <span className="ficha__linea-texto">
                  {servicio.service_type.name}
                  <span className="ficha__linea-detalle">
                    Venta N.º {servicio.sale_number}
                    {servicio.customer && ` · ${servicio.customer}`}
                  </span>
                </span>
                <span className="ficha__linea-monto">{formatearPesos(servicio.labor_price)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Ficha>
  )
}
