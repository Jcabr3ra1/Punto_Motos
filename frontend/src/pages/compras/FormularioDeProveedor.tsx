import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { crearProveedor, editarProveedor } from '../../api/compras'
import { claves } from '../../api/consultas'
import { desglosarError } from '../../api/errors'
import type { Supplier } from '../../api/types'
import { AvisoDeError } from '../../components/AvisoDeError'
import { Campo } from '../../components/Campo'
import { Casilla } from '../../components/Casilla'

interface Props {
  /** Si se recibe, se edita ese proveedor; si no, se crea uno nuevo. */
  proveedor?: Supplier
  /** Recibe el aviso y el proveedor tal como quedó guardado. */
  onTerminar: (aviso: string, guardado: Supplier) => void
  onCancelar: () => void
}

export function FormularioDeProveedor({ proveedor, onTerminar, onCancelar }: Props) {
  const clienteDeConsultas = useQueryClient()
  const editando = proveedor !== undefined
  const [nombre, setNombre] = useState(proveedor?.name ?? '')
  const [nit, setNit] = useState(proveedor?.tax_id ?? '')
  const [telefono, setTelefono] = useState(proveedor?.phone ?? '')
  const [notas, setNotas] = useState(proveedor?.notes ?? '')
  const [activo, setActivo] = useState(proveedor?.is_active ?? true)

  const guardar = useMutation({
    mutationFn: () => {
      const datos = { name: nombre, tax_id: nit, phone: telefono, notes: notas }
      return editando ? editarProveedor(proveedor.id, { ...datos, is_active: activo }) : crearProveedor(datos)
    },
    onSuccess: async (guardado) => {
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.proveedores })
      onTerminar(editando ? `Cambios de «${guardado.name}» guardados.` : `Proveedor «${guardado.name}» creado.`, guardado)
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
      <Campo
        etiqueta="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        errores={error?.campos.name}
        maxLength={80}
        autoComplete="off"
        autoFocus
        required
      />
      <div className="campos-en-fila">
        <Campo
          etiqueta="NIT o cédula"
          value={nit}
          onChange={(e) => setNit(e.target.value)}
          errores={error?.campos.tax_id}
          maxLength={30}
          autoComplete="off"
        />
        <Campo
          etiqueta="Teléfono"
          type="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          errores={error?.campos.phone}
          maxLength={30}
          autoComplete="off"
        />
      </div>
      <Campo
        etiqueta="Notas"
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        errores={error?.campos.notes}
        maxLength={200}
        autoComplete="off"
      />
      {editando && (
        <Casilla
          etiqueta="Proveedor activo"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          ayuda="Si lo desactivas no se puede elegir en compras nuevas, pero se le pueden seguir registrando abonos."
        />
      )}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear proveedor'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
