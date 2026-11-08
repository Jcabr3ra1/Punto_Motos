import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  crearElementoDeCatalogo,
  editarElementoDeCatalogo,
  type ElementoDeCatalogo,
} from '../../../api/catalogo'
import { claves } from '../../../api/consultas'
import { desglosarError } from '../../../api/errors'
import type { CatalogItemInput } from '../../../api/types'
import { AvisoDeError } from '../../../components/AvisoDeError'
import { Campo } from '../../../components/Campo'
import { Casilla } from '../../../components/Casilla'
import type { SeccionDeCatalogo } from './ListaDeCatalogo'

interface Props {
  seccion: SeccionDeCatalogo
  /** Si se recibe, se edita ese elemento; si no, se crea uno nuevo. */
  elemento?: ElementoDeCatalogo
  onTerminar: (aviso: string) => void
  onCancelar: () => void
}

export function FormularioDeCatalogo({ seccion, elemento, onTerminar, onCancelar }: Props) {
  const clienteDeConsultas = useQueryClient()
  const editando = elemento !== undefined
  const [nombre, setNombre] = useState(elemento?.name ?? '')
  const [sigla, setSigla] = useState(elemento?.abbreviation ?? '')
  const [activo, setActivo] = useState(elemento?.is_active ?? true)

  const guardar = useMutation({
    mutationFn: () => {
      const datos: CatalogItemInput = { name: nombre, ...(seccion.conSigla ? { abbreviation: sigla } : {}) }
      return editando
        ? editarElementoDeCatalogo<ElementoDeCatalogo>(seccion.tipo, elemento.id, { ...datos, is_active: activo })
        : crearElementoDeCatalogo<ElementoDeCatalogo>(seccion.tipo, datos)
    },
    onSuccess: async (guardado) => {
      // Los desplegables del formulario de producto usan estas mismas listas.
      await clienteDeConsultas.invalidateQueries({ queryKey: claves.catalogo })
      onTerminar(editando ? `Cambios de «${guardado.name}» guardados.` : seccion.creado(guardado.name))
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
      {seccion.conSigla && (
        <Campo
          etiqueta="Sigla"
          value={sigla}
          onChange={(e) => setSigla(e.target.value)}
          errores={error?.campos.abbreviation}
          ayuda={seccion.ayudaSigla}
          maxLength={8}
          autoComplete="off"
          required
        />
      )}
      {editando && (
        <Casilla
          etiqueta="Activo"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          ayuda="Si lo desactivas deja de aparecer al crear productos. Los productos que ya lo usan se conservan."
        />
      )}
      <div className="acciones">
        <button type="submit" className="boton boton--auto" disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear'}
        </button>
        <button type="button" className="boton boton--secundario boton--auto" data-cancelar onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
