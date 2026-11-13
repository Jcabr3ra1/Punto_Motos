import { FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'

interface Props {
  onExportar: () => Promise<void>
  disabled?: boolean
  etiqueta?: string
}

/** Botón reutilizable para descargar un archivo `.xlsx` evitando doble clic mientras se genera. */
export function BotonExportarExcel({ onExportar, disabled = false, etiqueta = 'Exportar Excel' }: Props) {
  const [exportando, setExportando] = useState(false)

  async function manejarClic() {
    if (exportando || disabled) return
    setExportando(true)
    try {
      await onExportar()
    } finally {
      setExportando(false)
    }
  }

  return (
    <button
      type="button"
      className="boton boton--secundario boton--auto boton--con-icono"
      disabled={disabled || exportando}
      onClick={() => void manejarClic()}
    >
      <FileSpreadsheet aria-hidden="true" size={16} />
      {exportando ? 'Exportando…' : etiqueta}
    </button>
  )
}
