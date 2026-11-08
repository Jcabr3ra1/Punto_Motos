import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import { guardarNegocio, obtenerNegocio } from '../../api/negocio'
import type { BusinessSettings, BusinessSettingsInput } from '../../api/types'
import { useUsuario } from '../../auth/useUsuario'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { CampoLargo } from '../../components/CampoLargo'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { DESTINOS } from '../../navegacion/destinos'

function aValores({ name, tax_id, address, phone, receipt_footer, default_mechanic_percentage }: BusinessSettings): BusinessSettingsInput {
  return { name, tax_id, address, phone, receipt_footer, default_mechanic_percentage }
}

const hayCambios = (a: BusinessSettingsInput, b: BusinessSettingsInput) =>
  (Object.keys(a) as (keyof BusinessSettingsInput)[]).some((campo) => a[campo] !== b[campo])

export function DatosDelNegocio() {
  const consulta = useQuery({
    queryKey: claves.negocio,
    queryFn: ({ signal }) => obtenerNegocio(signal),
  })

  return (
    <section>
      <EncabezadoDePantalla
        icono={DESTINOS.negocio.icono}
        titulo="Datos del negocio"
        descripcion="Aparecen en el encabezado y al pie del recibo."
      />
      <div className="tarjeta-de-formulario">
        {consulta.isPending && <Cargando />}
        {consulta.isError && <ErrorDeCarga error={consulta.error} onReintentar={() => void consulta.refetch()} />}
        {consulta.isSuccess && <FormularioDelNegocio negocio={consulta.data} />}
      </div>
    </section>
  )
}

// El dueño edita y guarda; el vendedor consulta los mismos datos en solo lectura.
function FormularioDelNegocio({ negocio }: { negocio: BusinessSettings }) {
  const puedeEditar = useUsuario().role === 'owner'
  const clienteDeConsultas = useQueryClient()
  const [valores, setValores] = useState(() => aValores(negocio))
  const [guardado, setGuardado] = useState(false)

  const guardar = useMutation({
    mutationFn: guardarNegocio,
    onSuccess: (actualizado) => {
      clienteDeConsultas.setQueryData(claves.negocio, actualizado)
      setValores(aValores(actualizado))
      setGuardado(true)
    },
  })

  const error = guardar.isError ? desglosarError(guardar.error) : null
  const conCambios = hayCambios(valores, aValores(negocio))

  function cambiar(campo: keyof BusinessSettingsInput, valor: string) {
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }))
    setGuardado(false)
  }

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (guardar.isPending) return
    guardar.mutate(valores)
  }

  return (
    <form onSubmit={alEnviar} noValidate className="formulario">
      {!puedeEditar && (
        <p role="status" className="aviso aviso--info">
          Solo el dueño puede cambiar estos datos.
        </p>
      )}
      {guardado && (
        <p role="status" className="aviso aviso--exito">
          Datos guardados.
        </p>
      )}
      <AvisoDeError mensajes={error?.generales ?? []} />
      <Campo
        etiqueta="Nombre del negocio"
        value={valores.name}
        onChange={(e) => cambiar('name', e.target.value)}
        errores={error?.campos.name}
        readOnly={!puedeEditar}
        maxLength={120}
        required
      />
      <Campo
        etiqueta="NIT o cédula"
        value={valores.tax_id}
        onChange={(e) => cambiar('tax_id', e.target.value)}
        errores={error?.campos.tax_id}
        readOnly={!puedeEditar}
        maxLength={30}
      />
      <Campo
        etiqueta="Dirección"
        value={valores.address}
        onChange={(e) => cambiar('address', e.target.value)}
        errores={error?.campos.address}
        readOnly={!puedeEditar}
        maxLength={200}
      />
      <Campo
        etiqueta="Teléfono"
        type="tel"
        value={valores.phone}
        onChange={(e) => cambiar('phone', e.target.value)}
        errores={error?.campos.phone}
        readOnly={!puedeEditar}
        maxLength={40}
      />
      <CampoLargo
        etiqueta="Mensaje al pie del recibo"
        value={valores.receipt_footer}
        onChange={(e) => cambiar('receipt_footer', e.target.value)}
        errores={error?.campos.receipt_footer}
        ayuda="Por ejemplo: «Gracias por su compra»."
        readOnly={!puedeEditar}
      />
      <Campo
        etiqueta="Porcentaje general de los mecánicos"
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={Number.isNaN(valores.default_mechanic_percentage) ? '' : String(valores.default_mechanic_percentage ?? '')}
        onChange={(e) => {
          const texto = e.target.value
          setValores((anteriores) => ({ ...anteriores, default_mechanic_percentage: texto === '' ? Number.NaN : Number(texto) }))
          setGuardado(false)
        }}
        errores={error?.campos.default_mechanic_percentage}
        ayuda="De 0 a 100. Parte de la mano de obra para los mecánicos sin porcentaje propio; el resto es del local."
        readOnly={!puedeEditar}
      />
      {puedeEditar && (
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending || !conCambios}>
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      )}
    </form>
  )
}
