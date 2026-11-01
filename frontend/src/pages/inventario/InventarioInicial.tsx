import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { isApiError } from '../../api/client'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { terminarConteoInicial } from '../../api/inventario'
import type { InitialCountStatus } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Titulo } from '../../components/Titulo'
import { formatearFechaHora } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { FormularioDeProducto } from '../productos/FormularioDeProducto'
import { useConteoInicial } from './useConteoInicial'

// Inventario inicial (solo el dueño): cuenta lo que hay en el negocio y lo carga producto por producto.
// Mientras el conteo esté abierto no se debe vender; el dueño lo termina una sola vez.
export function InventarioInicial() {
  const conteo = useConteoInicial()

  if (conteo.isPending) {
    return (
      <section>
        <Titulo>Inventario inicial</Titulo>
        <Cargando />
      </section>
    )
  }
  if (conteo.isError) {
    return (
      <section>
        <Titulo>Inventario inicial</Titulo>
        <ErrorDeCarga error={conteo.error} onReintentar={() => void conteo.refetch()} />
      </section>
    )
  }
  return conteo.data.is_open ? <ConteoAbierto estado={conteo.data} /> : <ConteoTerminado estado={conteo.data} />
}

function ConteoAbierto({ estado }: { estado: InitialCountStatus }) {
  const [aviso, setAviso] = useState<string | null>(null)
  // Cambiar la clave deja el formulario vacío y con el foco en el nombre para el siguiente producto.
  const [numeroDeCarga, setNumeroDeCarga] = useState(0)

  return (
    <section>
      <Titulo>Inventario inicial</Titulo>
      <p className="texto-suave">
        Cuenta todo lo que hay en el negocio y cárgalo producto por producto. Mientras el conteo esté abierto no se debe
        vender.
      </p>
      <dl className="avance" aria-label="Avance del conteo">
        <div>
          <dt>Productos cargados</dt>
          <dd>{formatearNumero(estado.products_counted)}</dd>
        </div>
        <div>
          <dt>Unidades cargadas</dt>
          <dd>{formatearNumero(estado.units_counted)}</dd>
        </div>
      </dl>

      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <Titulo nivel={2}>Cargar un producto</Titulo>
      <p className="texto-suave">Solo para productos nuevos. Si un producto ya existe, sus unidades se cargan con un ajuste.</p>
      <FormularioDeProducto
        key={numeroDeCarga}
        conteoInicial
        onTerminar={(mensaje) => {
          setAviso(mensaje)
          setNumeroDeCarga((n) => n + 1)
        }}
      />

      <TerminarConteo estado={estado} />
    </section>
  )
}

function TerminarConteo({ estado }: { estado: InitialCountStatus }) {
  const clienteDeConsultas = useQueryClient()
  const [confirmando, setConfirmando] = useState(false)

  const terminar = useMutation({
    mutationFn: terminarConteoInicial,
    onSuccess: (nuevoEstado) => clienteDeConsultas.setQueryData(claves.conteoInicial, nuevoEstado),
    onError: (fallo) => {
      // Si ya estaba terminado, se vuelve a consultar el estado para que la pantalla lo refleje.
      if (isApiError(fallo) && fallo.code === 'initial_count_finished') {
        void clienteDeConsultas.invalidateQueries({ queryKey: claves.conteoInicial })
      }
    },
  })
  const error = terminar.isError ? desglosarError(terminar.error) : null

  return (
    <section className="terminar" aria-label="Terminar el conteo">
      {!confirmando ? (
        <button type="button" className="boton boton--secundario boton--auto" onClick={() => setConfirmando(true)}>
          Terminar conteo
        </button>
      ) : (
        <div role="group" aria-labelledby="titulo-confirmar" className="confirmacion">
          <Titulo nivel={2}>
            <span id="titulo-confirmar">¿Terminar el inventario inicial?</span>
          </Titulo>
          <p>
            Cargaste <strong>{formatearNumero(estado.products_counted)}</strong>{' '}
            {estado.products_counted === 1 ? 'producto' : 'productos'} con{' '}
            <strong>{formatearNumero(estado.units_counted)}</strong>{' '}
            {estado.units_counted === 1 ? 'unidad' : 'unidades'}.
          </p>
          <p>
            <strong>Esta acción no se puede deshacer.</strong> Desde ese momento las existencias solo cambian con compras,
            ventas, devoluciones o ajustes.
          </p>
          <AvisoDeError mensajes={error?.generales ?? []} />
          <div className="acciones">
            <button
              type="button"
              className="boton boton--peligro boton--auto"
              disabled={terminar.isPending}
              onClick={() => terminar.mutate()}
            >
              {terminar.isPending ? 'Terminando…' : 'Sí, terminar el conteo'}
            </button>
            <button
              type="button"
              className="boton boton--secundario boton--auto"
              onClick={() => {
                terminar.reset()
                setConfirmando(false)
              }}
              autoFocus
            >
              Seguir contando
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function ConteoTerminado({ estado }: { estado: InitialCountStatus }) {
  return (
    <section>
      <Titulo>Inventario inicial</Titulo>
      <p role="status" className="aviso aviso--exito">
        El inventario inicial ya terminó
        {estado.finished_at ? ` el ${formatearFechaHora(estado.finished_at)}` : ''}
        {estado.finished_by ? ` (lo terminó ${estado.finished_by})` : ''}.
      </p>
      <p>
        Se cargaron {formatearNumero(estado.products_counted)} {estado.products_counted === 1 ? 'producto' : 'productos'} con{' '}
        {formatearNumero(estado.units_counted)} {estado.units_counted === 1 ? 'unidad' : 'unidades'}.
      </p>
      <p className="texto-suave">
        Desde ahora las existencias solo cambian con compras, ventas, devoluciones o ajustes.
      </p>
      <Link to="/productos">Ver los productos</Link>
    </section>
  )
}
