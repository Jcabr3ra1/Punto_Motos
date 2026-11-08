import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { crearAbono, listarCompras, listarProveedores, type FiltrosDeCompras } from '../../api/compras'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { PaymentMethod, SupplierPaymentInput } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { formatearPesos } from '../../utilidades/dinero'
import { hoyEnColombia } from '../../utilidades/fechas'
import { MedioDePago } from './MedioDePago'

interface Props {
  /** Proveedor ya elegido (al abonar desde el proveedor o desde una compra). */
  proveedorId?: number
  /** Compra ya elegida: todo el abono se aplica a ella. */
  compraId?: number
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}

// Abono a un proveedor (solo el dueño). Sin compra elegida, el backend paga primero las más antiguas.
// Los abonos no se editan ni se borran.
export function FormularioDeAbono({ proveedorId, compraId, onTerminar, onCancelar }: Props) {
  const clienteDeConsultas = useQueryClient()
  // A un proveedor desactivado se le pueden seguir registrando abonos: se piden todos.
  const proveedores = useQuery({
    queryKey: [...claves.proveedores, { include_inactive: true }],
    queryFn: ({ signal }) => listarProveedores({ include_inactive: true }, signal),
  })

  const [proveedor, setProveedor] = useState(proveedorId ? String(proveedorId) : '')
  const [compra, setCompra] = useState(compraId ? String(compraId) : '')
  const [valor, setValor] = useState('')
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [fecha, setFecha] = useState(hoyEnColombia)
  const [notas, setNotas] = useState('')

  const filtrosDeSaldo: FiltrosDeCompras = { supplier: Number(proveedor), payment_status: ['pending', 'partial'] }
  const comprasConSaldo = useQuery({
    queryKey: [...claves.compras, filtrosDeSaldo],
    queryFn: ({ signal }) => listarCompras(filtrosDeSaldo, signal),
    enabled: proveedor !== '',
  })

  const guardar = useMutation({
    mutationFn: () => {
      // Lo vacío no se envía: el backend responde «Este campo es requerido.» junto a cada campo.
      const datos = {
        ...(proveedor ? { supplier: Number(proveedor) } : {}),
        purchase: compra ? Number(compra) : null,
        ...(valor !== '' ? { amount: Number(valor) } : {}),
        method: medio,
        ...(fecha ? { paid_on: fecha } : {}),
        notes: notas,
      } as SupplierPaymentInput
      return crearAbono(datos)
    },
    onSuccess: async (abono) => {
      await Promise.all([
        clienteDeConsultas.invalidateQueries({ queryKey: claves.proveedores }),
        clienteDeConsultas.invalidateQueries({ queryKey: claves.compras }),
        clienteDeConsultas.invalidateQueries({ queryKey: claves.abonos }),
      ])
      const reparto = abono.allocations
        .map((a) => `${a.document_number || `compra n.º ${a.purchase}`} (${formatearPesos(a.amount)})`)
        .join(', ')
      onTerminar(
        `Abono de ${formatearPesos(abono.amount)} registrado a «${abono.supplier.name}».${reparto ? ` Se aplicó a: ${reparto}.` : ''}`,
      )
    },
  })

  if (proveedores.isPending) return <Cargando />
  if (proveedores.isError) return <ErrorDeCarga error={proveedores.error} onReintentar={() => void proveedores.refetch()} />

  const error = guardar.isError ? desglosarError(guardar.error) : null
  const elegido = proveedores.data.find((p) => String(p.id) === proveedor)
  const compraElegida = comprasConSaldo.data?.results.find((c) => String(c.id) === compra)

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <AvisoDeError mensajes={error?.generales ?? []} />
      {proveedorId && elegido ? (
        <p>
          Proveedor: <strong>{elegido.name}</strong>
        </p>
      ) : (
        <CampoSelector
          etiqueta="Proveedor"
          value={proveedor}
          onChange={(e) => {
            setProveedor(e.target.value)
            setCompra('')
          }}
          opciones={[
            { valor: '', texto: 'Elige un proveedor' },
            ...proveedores.data.map((p) => ({ valor: String(p.id), texto: p.is_active ? p.name : `${p.name} (desactivado)` })),
          ]}
          errores={error?.campos.supplier}
          required
        />
      )}
      {elegido && (
        <p className="texto-suave">
          Se le debe en total: <strong>{formatearPesos(elegido.balance_due)}</strong>
        </p>
      )}

      {compraId ? (
        compraElegida && (
          <p>
            Compra: <strong>{compraElegida.document_number || `n.º ${compraElegida.id}`}</strong> · saldo{' '}
            {formatearPesos(compraElegida.balance_due)}
          </p>
        )
      ) : (
        proveedor !== '' && (
          <CampoSelector
            etiqueta="Aplicar a"
            value={compra}
            onChange={(e) => setCompra(e.target.value)}
            opciones={[
              { valor: '', texto: 'Las compras más antiguas primero' },
              ...(comprasConSaldo.data?.results ?? []).map((c) => ({
                valor: String(c.id),
                texto: `${c.document_number || `Compra n.º ${c.id}`} · saldo ${formatearPesos(c.balance_due)}`,
              })),
            ]}
            errores={error?.campos.purchase}
          />
        )
      )}

      <div className="campos-en-fila">
        <Campo
          etiqueta="Valor"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          errores={error?.campos.amount}
          ayuda="En pesos, sin puntos ni decimales."
          autoFocus
          required
        />
        <Campo
          etiqueta="Fecha de pago"
          type="date"
          max={hoyEnColombia()}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          errores={error?.campos.paid_on}
        />
      </div>
      <MedioDePago nombre="medio-abono" valor={medio} onCambiar={setMedio} errores={error?.campos.method} />
      <Campo
        etiqueta="Notas"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        errores={error?.campos.notes}
        ayuda="Opcional. Por ejemplo: «Nequi»."
        maxLength={200}
        autoComplete="off"
      />
      <p className="texto-suave">Los abonos no se editan ni se borran.</p>
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Registrar abono'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
