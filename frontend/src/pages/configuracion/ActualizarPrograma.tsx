import { isTauri } from '@tauri-apps/api/core'
import { useState } from 'react'
import { Titulo } from '../../components/Titulo'
import { Actualizaciones } from '../../desktop/Actualizaciones'

/** Buscar e instalar una versión nueva del programa. Solo funciona en el programa instalado. */
export function ActualizarPrograma() {
  const [desktop] = useState(isTauri)
  return (
    <section>
      <Titulo nivel={2}>Actualizar programa</Titulo>
      {desktop ? (
        <Actualizaciones />
      ) : (
        <p className="aviso aviso--info">Las actualizaciones solo se buscan desde el programa instalado.</p>
      )}
    </section>
  )
}
