import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { obtenerCaja } from '../../api/caja'
import { claves } from '../../api/consultas'
import { Ficha } from '../../components/Ficha'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearFechaHora } from '../../utilidades/fechas'
import { CifrasDeCaja } from './ResumenDeCaja'

/** Resumen de una caja anterior junto a la lista: sus cifras y si cuadró. */
export function FichaDeCaja({ id, abierta, onCerrar }: { id: number; abierta: string; onCerrar: () => void }) {
  const caja = useQuery({ queryKey: [...claves.caja, 'detalle', id], queryFn: ({ signal }) => obtenerCaja(id, signal) })
  return (
    <Ficha
      titulo={`Caja del ${formatearFechaHora(abierta)}`}
      modulo="Cajas anteriores"
      onCerrar={onCerrar}
      acciones={
        <Link to={`${DESTINOS.cajaHistorial.ruta}/${id}`} className="boton boton--auto">
          Abrir la caja
        </Link>
      }
    >
      {caja.isPending && <p className="texto-suave">Cargando la caja…</p>}
      {caja.isError && <p className="texto-suave">No se pudo cargar la caja.</p>}
      {caja.data && <CifrasDeCaja caja={caja.data} />}
    </Ficha>
  )
}
