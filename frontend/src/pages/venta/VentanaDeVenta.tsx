import { CircleCheck } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SaleDetail } from '../../api/types'
import { useDevolverFoco, useFocoAtrapado, useFondoInerte } from '../../components/useFocoAtrapado'
import { formatearPesos } from '../../utilidades/dinero'
import { Recibo } from './Recibo'

/**
 * La venta ya registrada, en una ventana sobre Vender: el vuelto en grande para dárselo al cliente y el recibo.
 * «Nueva venta» (o Esc) la cierra y deja el mostrador listo para la siguiente.
 */
export function VentanaDeVenta({ venta, vuelto, onNuevaVenta }: { venta: SaleDetail; vuelto: number; onNuevaVenta: () => void }) {
  const ventana = useRef<HTMLDivElement>(null)
  const nueva = useRef<HTMLButtonElement>(null)
  const idTitulo = useId()
  useFondoInerte()
  useDevolverFoco()
  useFocoAtrapado(ventana, true)

  // El foco empieza en «Nueva venta»: Enter atiende al siguiente cliente.
  useEffect(() => {
    nueva.current?.focus()
  }, [])

  return createPortal(
    <div className="dialogo__velo">
      <div
        ref={ventana}
        className="dialogo ventana-de-venta"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape') return
          evento.preventDefault()
          evento.stopPropagation()
          onNuevaVenta()
        }}
      >
        <div className="ventana-de-venta__cabecera">
          <CircleCheck className="ventana-de-venta__icono" aria-hidden="true" size={28} />
          <div>
            <h2 id={idTitulo} className="dialogo__titulo">
              Venta registrada
            </h2>
            <p role="status" className="ventana-de-venta__resumen">
              Venta n.º {venta.number} registrada por {formatearPesos(venta.total)}.
              {vuelto > 0 && ` Vuelto: ${formatearPesos(vuelto)}.`}
            </p>
          </div>
        </div>
        {vuelto > 0 && (
          // El vuelto ya se anuncia en el resumen; aquí va grande para leerlo de un vistazo.
          <p className="ventana-de-venta__vuelto" aria-hidden="true">
            <span>Vuelto</span>
            <strong>{formatearPesos(vuelto)}</strong>
          </p>
        )}
        <div className="ventana-de-venta__recibo">
          <Recibo venta={venta} vuelto={vuelto} />
        </div>
        <div className="dialogo__acciones">
          <button ref={nueva} type="button" className="boton boton--auto" onClick={onNuevaVenta}>
            Nueva venta
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
