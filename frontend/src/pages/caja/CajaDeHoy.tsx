import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { abrirCaja, cerrarCaja, registrarSalida } from '../../api/caja'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { CashSession, PaymentMethod, SpendInput } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { MedioDePago } from '../compras/MedioDePago'
import { CifrasDeCaja, MovimientosDeCaja, ResumenPorTipo } from './ResumenDeCaja'

type Vista = 'resumen' | 'salida' | 'cerrar'

// Caja de hoy (solo el dueño): la jornada de dinero. Se abre con el efectivo del cajón y se cierra
// contándolo. Sin caja abierta no se vende, no se anula y no se registran abonos ni pagos de hoy.
export function CajaDeHoy() {
  const actual = useCajaActual()
  const [aviso, setAviso] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('resumen')

  if (actual.isPending) return <Cargando />
  if (actual.isError) return <ErrorDeCarga error={actual.error} onReintentar={() => void actual.refetch()} />

  const caja = actual.data.session
  return (
    <>
      <Titulo nivel={2}>Caja de hoy</Titulo>
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      {!actual.data.is_open || !caja ? (
        <AbrirCaja
          sugerido={actual.data.suggested_opening_cash ?? 0}
          onAbierta={(abierta) => {
            setVista('resumen')
            setAviso(`Caja abierta con ${formatearPesos(abierta.opening_cash)} en efectivo.`)
          }}
        />
      ) : vista === 'salida' ? (
        <RegistrarSalida
          onTerminar={(mensaje) => {
            setAviso(mensaje)
            setVista('resumen')
          }}
          onCancelar={() => setVista('resumen')}
        />
      ) : vista === 'cerrar' ? (
        <CerrarCaja
          caja={caja}
          onCerrada={(cerrada) => {
            setVista('resumen')
            setAviso(
              `Caja cerrada. Contado: ${formatearPesos(cerrada.counted_cash ?? 0)}. ${
                !cerrada.difference ? 'Cuadró.' : cerrada.difference > 0 ? `Sobraron ${formatearPesos(cerrada.difference)}.` : `Faltaron ${formatearPesos(-cerrada.difference)}.`
              }`,
            )
          }}
          onCancelar={() => setVista('resumen')}
        />
      ) : (
        <>
          <p className="texto-suave">
            Abierta el {formatearFechaHora(caja.opened_at)} por {caja.opened_by}.
          </p>
          <CifrasDeCaja caja={caja} />
          <div className="acciones acciones--arriba">
            <button
              type="button"
              className="boton boton--secundario boton--auto"
              onClick={() => {
                setAviso(null)
                setVista('salida')
              }}
            >
              Registrar gasto o retiro
            </button>
            <button
              type="button"
              className="boton boton--auto"
              onClick={() => {
                setAviso(null)
                setVista('cerrar')
              }}
            >
              Cerrar caja…
            </button>
          </div>
          <Titulo nivel={3}>Resumen</Titulo>
          <ResumenPorTipo caja={caja} />
          <MovimientosDeCaja cajaId={caja.id} />
        </>
      )}
    </>
  )
}

function AbrirCaja({ sugerido, onAbierta }: { sugerido: number; onAbierta: (caja: CashSession) => void }) {
  const clienteDeConsultas = useQueryClient()
  const [efectivo, setEfectivo] = useState(String(sugerido))
  const abrir = useMutation({
    mutationFn: () => abrirCaja(Number(efectivo)),
    onSuccess: async (caja) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
      onAbierta(caja)
    },
  })
  const error = abrir.isError ? desglosarError(abrir.error) : null

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (abrir.isPending) return
    abrir.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <p role="status" className="aviso aviso--advertencia">
        La caja está cerrada: no se puede vender ni registrar dinero de hoy hasta abrirla.
      </p>
      <AvisoDeError mensajes={error?.generales ?? []} />
      <Campo
        etiqueta="Efectivo en el cajón al abrir"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={efectivo}
        onChange={(e) => setEfectivo(e.target.value)}
        errores={error?.campos.opening_cash}
        ayuda={`Sugerido: ${formatearPesos(sugerido)}, lo que se contó en el último cierre.`}
        autoFocus
        required
      />
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={abrir.isPending || efectivo === ''}>
          {abrir.isPending ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </div>
    </form>
  )
}

function RegistrarSalida({ onTerminar, onCancelar }: { onTerminar: (aviso: string) => void; onCancelar: () => void }) {
  const clienteDeConsultas = useQueryClient()
  const [tipo, setTipo] = useState<SpendInput['kind']>('expense')
  const [valor, setValor] = useState('')
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [motivo, setMotivo] = useState('')
  const guardar = useMutation({
    mutationFn: () => registrarSalida({ kind: tipo, ...(valor !== '' ? { amount: Number(valor) } : {}), method: medio, reason: motivo } as SpendInput),
    onSuccess: async (movimiento) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
      onTerminar(`${movimiento.kind_label} de ${formatearPesos(-movimiento.amount)} registrado.`)
    },
    onError: (fallo) => {
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
    },
  })
  const error = guardar.isError ? desglosarError(guardar.error) : null

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <Titulo nivel={3}>Registrar gasto o retiro</Titulo>
      <AvisoDeError mensajes={error?.generales ?? []} />
      <fieldset className="conjunto">
        <legend>¿Qué es?</legend>
        <div className="opciones-en-fila">
          <label className="opcion">
            <input type="radio" name="tipo-salida" checked={tipo === 'expense'} onChange={() => setTipo('expense')} />
            Gasto del negocio
          </label>
          <label className="opcion">
            <input type="radio" name="tipo-salida" checked={tipo === 'owner_withdrawal'} onChange={() => setTipo('owner_withdrawal')} />
            Retiro del dueño
          </label>
        </div>
      </fieldset>
      <Campo
        etiqueta="Valor"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        errores={error?.campos.amount}
        autoFocus
        required
      />
      <MedioDePago nombre="medio-salida" valor={medio} onCambiar={setMedio} errores={error?.campos.method} />
      <Campo
        etiqueta="Motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        errores={error?.campos.reason}
        ayuda="Obligatorio. Por ejemplo: «Almuerzo» o «Pago de energía»."
        autoComplete="off"
        required
      />
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Registrar'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function CerrarCaja({
  caja,
  onCerrada,
  onCancelar,
}: {
  caja: CashSession
  onCerrada: (caja: CashSession) => void
  onCancelar: () => void
}) {
  const clienteDeConsultas = useQueryClient()
  const [contado, setContado] = useState('')
  const [notas, setNotas] = useState('')
  const diferencia = contado === '' ? null : Number(contado) - caja.expected_cash
  const cerrar = useMutation({
    mutationFn: () => cerrarCaja(caja.id, { ...(contado !== '' ? { counted_cash: Number(contado) } : {}), notes: notas }),
    onSuccess: async (cerrada) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
      onCerrada(cerrada)
    },
    onError: (fallo) => {
      if (isApiError(fallo) && fallo.code === 'cash_session_closed') void clienteDeConsultas.invalidateQueries({ queryKey: claves.caja })
    },
  })
  const error = cerrar.isError ? desglosarError(cerrar.error) : null

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (cerrar.isPending) return
    cerrar.mutate()
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      <Titulo nivel={3}>Cerrar la caja</Titulo>
      <p>
        Efectivo esperado en el cajón: <strong>{formatearPesos(caja.expected_cash)}</strong>. Cuenta el efectivo y escribe
        cuánto hay.
      </p>
      <AvisoDeError mensajes={error?.generales ?? []} />
      <Campo
        etiqueta="Efectivo contado"
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={contado}
        onChange={(e) => setContado(e.target.value)}
        errores={error?.campos.counted_cash}
        autoFocus
        required
      />
      {diferencia !== null && (
        <p role="status" className={diferencia === 0 ? 'aviso aviso--exito' : 'aviso aviso--advertencia'}>
          {diferencia === 0
            ? 'Cuadra con lo esperado.'
            : diferencia > 0
              ? `Sobran ${formatearPesos(diferencia)}: explica la diferencia.`
              : `Faltan ${formatearPesos(-diferencia)}: explica la diferencia.`}
        </p>
      )}
      <Campo
        etiqueta="Explicación"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        errores={error?.campos.notes}
        ayuda="Obligatoria si el contado no coincide con lo esperado."
        autoComplete="off"
      />
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={cerrar.isPending || contado === ''}>
          {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" onClick={onCancelar}>
          Volver
        </button>
      </div>
    </form>
  )
}
