import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { claves } from '../../api/consultas'
import { obtenerLiquidacion } from '../../api/taller'
import { Registro } from '../../components/Registro'
import { VentanaDeDocumento } from '../../components/VentanaDeDocumento'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia } from '../../utilidades/fechas'
import { HojaDeLiquidacion } from './HojaDeLiquidacion'

/** Detalle de una liquidación en el registro negro: lo pagado y los servicios que cubrió. */
export function FichaDeLiquidacion({ id, mecanico, onCerrar }: { id: number; mecanico: string; onCerrar: () => void }) {
  const liquidacion = useQuery({
    queryKey: [...claves.liquidaciones, 'detalle', id],
    queryFn: ({ signal }) => obtenerLiquidacion(id, signal),
  })
  const datos = liquidacion.data
  const [viendoHoja, setViendoHoja] = useState(false)
  return (
    <>
      <Registro
        titulo={`Liquidación de ${mecanico}`}
        modulo="Historial de liquidaciones"
        onCerrar={onCerrar}
        acciones={
          <button type="button" className="boton" onClick={() => setViendoHoja(true)} disabled={!datos}>
            Abrir la hoja
          </button>
        }
      >
        {liquidacion.isPending && <p className="registro__nota">Cargando la liquidación…</p>}
        {liquidacion.isError && <p className="registro__nota">No se pudo cargar la liquidación.</p>}
        {datos && (
          <>
            <p className="registro__cifra">
              <span className="registro__total">{formatearPesos(datos.amount)}</span>
              <span className="registro__detalle">
                {datos.percentage} % de {formatearPesos(datos.labor_total)} · {datos.method_label}
              </span>
            </p>
            <dl className="registro__datos">
              <div>
                <dt>Día liquidado</dt>
                <dd>{formatearDia(datos.date)}</dd>
              </div>
              <div>
                <dt>Descuentos</dt>
                <dd>{datos.deductions_total > 0 ? formatearPesos(datos.deductions_total) : '—'}</dd>
              </div>
            </dl>
            <h4 className="registro__subtitulo">Servicios</h4>
            <ul className="registro__lineas">
              {datos.services.map((servicio) => (
                <li key={servicio.id}>
                  <span>
                    {servicio.service_type.name}
                    <span className="registro__detalle">
                      Venta N.º {servicio.sale_number}
                      {servicio.customer && ` · ${servicio.customer}`}
                    </span>
                  </span>
                  <span className="registro__monto">{formatearPesos(servicio.labor_price)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Registro>
      {viendoHoja && datos && (
        <VentanaDeDocumento titulo={`Liquidación de ${mecanico}`} onCerrar={() => setViendoHoja(false)}>
          <HojaDeLiquidacion liquidacion={datos} />
        </VentanaDeDocumento>
      )}
    </>
  )
}
