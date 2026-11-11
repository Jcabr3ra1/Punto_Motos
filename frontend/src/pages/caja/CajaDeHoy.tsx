import { Lock, Minus, Unlock } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { abrirCaja, cerrarCaja, registrarSalida } from '../../api/caja'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { CashSession, PaymentMethod, SpendInput } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoPersonalizado }from '../../components/CampoPersonalizado'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { PanelLateral } from '../../components/PanelLateral'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { Registro } from '../../components/Registro'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { DESTINOS } from '../../navegacion/destinos'
import { VistaPrevia } from '../../components/VistaPrevia'
import { useCajaActual } from '../../hooks/useCajaActual'
import { formatearPesos, pesosConSigno } from '../../utilidades/dinero'
import { formatearFechaHora } from '../../utilidades/fechas'
import { MedioDePago } from '../compras/MedioDePago'
import { MovimientosDeCaja, ResumenEnLineas } from './ResumenDeCaja'

type Vista = 'resumen' | 'salida' | 'cerrar'

// Caja de hoy (solo el dueño): la jornada de dinero. Se abre con el efectivo del cajón y se cierra
// contándolo. Sin caja abierta no se vende, no se anula y no se registran abonos ni pagos de hoy.
export function CajaDeHoy() {
  const actual = useCajaActual()
  const [aviso, setAviso] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('resumen')
  const [resumenAbierto, setResumenAbierto] = useState(false)
  const botonResumen = useRef<HTMLButtonElement>(null)
  const fichaResumen = useRef<HTMLDivElement>(null)
  const resumenVisitado = useRef(false)

  useEffect(() => {
    if (resumenAbierto) {
      resumenVisitado.current = true
      // En área angosta PanelLateral administra su propio foco; aquí solo se enfoca la ficha integrada.
      fichaResumen.current?.querySelector<HTMLButtonElement>('button')?.focus()
    } else if (resumenVisitado.current) {
      botonResumen.current?.focus()
    }
  }, [resumenAbierto])

  if (actual.isPending) return <Cargando />
  if (actual.isError) return <ErrorDeCarga error={actual.error} onReintentar={() => void actual.refetch()} />

  const caja = actual.data.session
  const abierta = actual.data.is_open && Boolean(caja)
  // El resumen cubre toda la sesión; las páginas del diario no intervienen en el balance.
  const efectivo = caja?.summary?.by_kind.reduce(
    (total, fila) => ({ entradas: total.entradas + Math.max(0, fila.cash), salidas: total.salidas + Math.max(0, -fila.cash) }),
    { entradas: 0, salidas: 0 },
  )
  return (
    <div className={`caja-hoy${resumenAbierto ? ' caja-hoy--con-resumen' : ''}`}>
      <EncabezadoDePantalla
        icono={DESTINOS.cajaActual.icono}
        titulo="Caja de hoy"
        descripcion={abierta && caja ? `Abierta el ${formatearFechaHora(caja.opened_at)} por ${caja.opened_by}.` : 'Abre la jornada con el efectivo del cajón.'}
        acciones={<span className={`caja-hoy__estado${abierta ? ' caja-hoy__estado--abierta' : ''}`}>{abierta ? 'Abierta' : 'Cerrada'}</span>}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      {!actual.data.is_open || !caja ? (
        <div className="caja-hoy__apertura">
          <AbrirCaja
            sugerido={actual.data.suggested_opening_cash ?? 0}
            onAbierta={(abierta) => {
              setVista('resumen')
              setResumenAbierto(false)
              setAviso(`Caja abierta con ${formatearPesos(abierta.opening_cash)} en efectivo.`)
            }}
          />
        </div>
      ) : (
        <>
          <FranjaDeIndicadores indicadores={[
            { rotulo: 'Efectivo inicial', valor: formatearPesos(caja.opening_cash) },
            { rotulo: 'Entró en efectivo', valor: efectivo ? <span className="cantidad--entra">{pesosConSigno(efectivo.entradas)}</span> : '—' },
            { rotulo: 'Salió en efectivo', valor: efectivo ? <span className="cantidad--sale">{pesosConSigno(-efectivo.salidas)}</span> : '—' },
            { rotulo: 'Transferencias · neto', valor: caja.summary ? formatearPesos(caja.summary.transfer_total) : '—' },
          ]} />
          <div className="caja-hoy__cuerpo">
            <MovimientosDeCaja key={caja.id} cajaId={caja.id} deHoy />
            <aside className="caja-hoy__cajon" aria-label="El cajón">
              <dl className="caja-hoy__balance" aria-label="Cifras de la caja">
                <div className="caja-hoy__esperado">
                  <dt>Efectivo esperado en el cajón</dt>
                  <dd title={formatearPesos(caja.expected_cash)}>{formatearPesos(caja.expected_cash)}</dd>
                </div>
                <div className="caja-hoy__desglose">
                  <dt>Base al abrir</dt><dd>{formatearPesos(caja.opening_cash)}</dd>
                </div>
                <div className="caja-hoy__desglose">
                  <dt>+ Entró en efectivo</dt><dd>{efectivo ? formatearPesos(efectivo.entradas) : '—'}</dd>
                </div>
                <div className="caja-hoy__desglose">
                  <dt>− Salió en efectivo</dt><dd>{efectivo ? formatearPesos(efectivo.salidas) : '—'}</dd>
                </div>
                <div className="caja-hoy__transferencias">
                  <dt>Transferencias</dt><dd>{caja.summary ? formatearPesos(caja.summary.transfer_total) : '—'}</dd>
                </div>
              </dl>
              <button ref={botonResumen} type="button" className="boton boton--secundario" onClick={() => setResumenAbierto(true)}>
                Ver resumen por tipo
              </button>
              <div className="caja-hoy__cierre">
                <h3>Para cerrar</h3>
                <p>Falta contar el efectivo.</p>
                <p className="caja-hoy__ayuda-cierre">Si hay diferencia, explica el motivo.</p>
                <button
                  type="button"
                  className="boton boton--secundario"
                  onClick={() => {
                    setAviso(null)
                    setVista('salida')
                  }}
                >
                  <Minus aria-hidden="true" size={16} />
                  Registrar gasto o retiro
                </button>
                <button
                  type="button"
                  className="boton"
                  onClick={() => {
                    setAviso(null)
                    setVista('cerrar')
                  }}
                >
                  <Lock aria-hidden="true" size={16} />
                  Cerrar caja
                </button>
              </div>
            </aside>
            {resumenAbierto && (
              <div ref={fichaResumen} className="caja-hoy__resumen">
                <Registro titulo="Resumen por tipo" modulo="Caja de hoy" onCerrar={() => setResumenAbierto(false)}>
                  <ResumenEnLineas caja={caja} />
                  <p className="registro__nota">Las transferencias se suman aparte: no forman parte del efectivo del cajón.</p>
                </Registro>
              </div>
            )}
          </div>
        </>
      )}
      {caja && vista === 'salida' && (
        <PanelLateral
          titulo="Registrar gasto o retiro"
          modulo="Caja"
          descripcion="Registra una salida en efectivo o por transferencia: queda en el resumen del día."
          onCerrar={() => setVista('resumen')}
        >
          <RegistrarSalida
            onTerminar={(mensaje) => {
              setAviso(mensaje)
              setVista('resumen')
              setResumenAbierto(false)
            }}
            onCancelar={() => setVista('resumen')}
          />
        </PanelLateral>
      )}
      {caja && vista === 'cerrar' && (
        <PanelLateral
          titulo="Cerrar la caja"
          modulo="Caja"
          descripcion={`Efectivo esperado en el cajón: ${formatearPesos(caja.expected_cash)}. Cuenta el efectivo y escribe cuánto hay.`}
          onCerrar={() => setVista('resumen')}
        >
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
        </PanelLateral>
      )}
    </div>
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

  const distinto = sugerido > 0 && efectivo !== String(sugerido)

  return (
    <form onSubmit={alEnviar} noValidate className="formulario apertura">
      <div className="apertura__intro">
        <h3>Abrir la jornada</h3>
        <p>Mientras la caja esté cerrada no se puede vender ni registrar dinero de hoy.</p>
      </div>
      <AvisoDeError mensajes={error?.generales ?? []} />
      <CampoPersonalizado etiqueta="Efectivo en el cajón al abrir" errores={error?.campos.opening_cash}>
        {(propiedades) => (
          <div className="apertura__monto">
            <span aria-hidden="true">$</span>
            <input
              {...propiedades}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={efectivo}
              onChange={(e) => setEfectivo(e.target.value)}
              autoFocus
              required
            />
          </div>
        )}
      </CampoPersonalizado>
      {sugerido > 0 && (
        <p className="apertura__sugerido">
          {distinto ? (
            <>
              En el último cierre se contaron {formatearPesos(sugerido)}.{' '}
              <button type="button" className="apertura__usar" onClick={() => setEfectivo(String(sugerido))}>
                Usar {formatearPesos(sugerido)}
              </button>
            </>
          ) : (
            `Es lo que se contó en el último cierre (${formatearPesos(sugerido)}).`
          )}
        </p>
      )}
      <div className="apertura__acciones">
        <button type="submit" className="boton boton--auto" disabled={abrir.isPending || efectivo === ''}>
          <Unlock aria-hidden="true" size={16} />
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
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
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
        <VistaPrevia
          etiqueta="Efectivo en el cajón"
          antes={formatearPesos(caja.expected_cash)}
          despues={formatearPesos(Number(contado))}
          alerta={diferencia !== 0}
          nota={
            diferencia === 0
              ? 'Cuadra con lo esperado.'
              : diferencia > 0
                ? `Sobran ${formatearPesos(diferencia)}: explica la diferencia.`
                : `Faltan ${formatearPesos(-diferencia)}: explica la diferencia.`
          }
        />
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
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Volver
        </button>
      </div>
    </form>
  )
}
