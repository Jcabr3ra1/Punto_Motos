import writeXlsxFile, { type CellObject, type Row } from 'write-excel-file/browser'

export type ValorCelda = string | number | boolean | null | undefined

export interface HojaExcel {
  nombre: string
  encabezados: string[]
  filas: ValorCelda[][]
}

function limpiarNombreHoja(nombre: string): string {
  const limpio = nombre.replace(/[\\/*?:[\]]/g, ' ').trim() || 'Datos'
  return limpio.slice(0, 31)
}

function celdaDeValor(valor: ValorCelda): CellObject {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return { type: Number, value: valor }
  }
  if (typeof valor === 'boolean') {
    return { type: String, value: valor ? 'Sí' : 'No' }
  }
  return { type: String, value: valor == null ? '' : String(valor) }
}

/** Genera y descarga un archivo `.xlsx` con una o varias hojas, encabezados resaltados y ancho automático. */
export async function exportarExcel(nombreArchivo: string, hojas: HojaExcel[]): Promise<void> {
  const sheets = hojas.map((hoja) => {
    const anchos = hoja.encabezados.map((encabezado) => encabezado.length)
    const filaEncabezado: Row = hoja.encabezados.map((encabezado) => ({
      type: String,
      value: encabezado,
      fontWeight: 'bold',
      backgroundColor: '#f1f6c8',
    }))
    const filasDatos: Row[] = hoja.filas.map((fila) =>
      fila.map((valor, col) => {
        const texto = valor == null ? '' : typeof valor === 'boolean' ? 'Sí' : String(valor)
        anchos[col] = Math.max(anchos[col] ?? 10, texto.length)
        return celdaDeValor(valor)
      }),
    )

    return {
      sheet: limpiarNombreHoja(hoja.nombre),
      columns: anchos.map((largo) => ({ width: Math.min(48, Math.max(12, largo + 3)) })),
      data: [filaEncabezado, ...filasDatos],
    }
  })

  const archivo = nombreArchivo.endsWith('.xlsx') ? nombreArchivo : `${nombreArchivo}.xlsx`
  await writeXlsxFile(sheets).toFile(archivo)
}

/** Reúne todas las páginas de un listado paginado (en lotes de 200) para exportar completo a Excel. */
export async function todasLasPaginas<T>(
  pedirPagina: (page: number, page_size: number) => Promise<{ results: T[]; next: string | null }>,
): Promise<T[]> {
  const acumulados: T[] = []
  let pagina = 1
  for (;;) {
    const respuesta = await pedirPagina(pagina, 200)
    acumulados.push(...respuesta.results)
    if (!respuesta.next || pagina >= 50) break
    pagina += 1
  }
  return acumulados
}
