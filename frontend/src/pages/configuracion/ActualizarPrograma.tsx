import { isTauri } from '@tauri-apps/api/core'
import { useState } from 'react'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { DESTINOS } from '../../navegacion/destinos'
import { Actualizaciones } from '../../desktop/Actualizaciones'

/** Buscar e instalar una versión nueva del programa. Solo funciona en el programa instalado. */
export function ActualizarPrograma() {
  const [desktop] = useState(isTauri)
  return (
    <section>
      <EncabezadoDePantalla
        icono={DESTINOS.actualizaciones.icono}
        titulo="Actualizar programa"
        descripcion="Busca una versión nueva e instálala cuando no haya ventas en curso."
      />
      <div className="tarjeta-de-formulario">
        {desktop ? (
          <Actualizaciones />
        ) : (
          <p className="aviso aviso--info">Las actualizaciones solo se buscan desde el programa instalado.</p>
        )}
      </div>
    </section>
  )
}
