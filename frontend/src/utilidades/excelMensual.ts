import writeXlsxFile, { type CellObject, type Row } from 'write-excel-file/browser'
import type { MonthlyReport } from '../api/types'

const CARBON = '#141517'
const CARBON_SUAVE = '#232528'
const LIMA = '#D4E157'
const LIMA_SUAVE = '#F1F6C8'
const CREMA = '#F8F9F0'
const PAPEL = '#FFFFFF'
const CEBRA = '#F5F6F8'
const BORDE = '#D6D8CE'
const TINTA = '#18191B'
const TINTA_SUAVE = '#5B5E66'
const ROJO_FONDO = '#FEE2E2'
const ROJO_TINTA = '#991B1B'
const AMBAR_FONDO = '#FEF3C7'
const AMBAR_TINTA = '#92400E'

const FORMATO_PESOS = '$ #,##0'
const FORMATO_ENTERO = '#,##0'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** `"2026-11"` → `"Noviembre de 2026"`. */
export function tituloMes(month: string): string {
  const [anio, mes] = month.split('-')
  const indice = Number(mes) - 1
  const nombre = MESES[indice]
  if (!nombre) return month
  return `${nombre.charAt(0).toUpperCase() + nombre.slice(1)} de ${anio}`
}

const bordeCaja = {
  borderColor: BORDE,
  borderStyle: 'thin' as const,
}

function texto(
  valor: string,
  extra: Partial<CellObject> = {},
): CellObject {
  return {
    type: String,
    value: valor,
    fontFamily: 'Calibri',
    fontSize: 10,
    textColor: TINTA,
    alignVertical: 'center',
    ...extra,
  }
}

function numero(
  valor: number,
  formato = FORMATO_ENTERO,
  extra: Partial<CellObject> = {},
): CellObject {
  return {
    type: Number,
    value: Number.isFinite(valor) ? valor : 0,
    format: formato,
    fontFamily: 'Calibri',
    fontSize: 10,
    textColor: TINTA,
    align: 'right',
    alignVertical: 'center',
    ...extra,
  }
}

function pesos(valor: number, extra: Partial<CellObject> = {}): CellObject {
  return numero(valor, FORMATO_PESOS, extra)
}

function rellenoSpanned(columnas: number, primera: CellObject): Row {
  return [primera, ...Array.from({ length: columnas - 1 }, () => null)]
}

function encabezadoBanner(
  titulo: string,
  subtitulo: string,
  columnas: number,
): Row[] {
  return [
    rellenoSpanned(
      columnas,
      texto(titulo, {
        columnSpan: columnas,
        fontSize: 14,
        fontWeight: 'bold',
        textColor: LIMA,
        backgroundColor: CARBON,
        align: 'left',
        height: 32,
        indent: 1,
      }),
    ),
    rellenoSpanned(
      columnas,
      texto(subtitulo, {
        columnSpan: columnas,
        fontSize: 10,
        textColor: '#F4F4EE',
        backgroundColor: CARBON_SUAVE,
        align: 'left',
        height: 22,
        indent: 1,
      }),
    ),
    [{ value: '', height: 10 }],
  ]
}

function seccionTitulo(titulo: string, columnas: number): Row {
  return rellenoSpanned(
    columnas,
    texto(titulo, {
      columnSpan: columnas,
      fontSize: 11,
      fontWeight: 'bold',
      textColor: TINTA,
      backgroundColor: LIMA_SUAVE,
      bottomBorderColor: CARBON,
      bottomBorderStyle: 'medium',
      height: 24,
      indent: 1,
    }),
  )
}

function filaTablaEncabezado(titulos: string[], alineacionDerechaDesde = 1): Row {
  return titulos.map((t, i) =>
    texto(t, {
      fontWeight: 'bold',
      textColor: '#FFFFFF',
      backgroundColor: CARBON,
      align: i >= alineacionDerechaDesde ? 'right' : 'left',
      height: 23,
      ...bordeCaja,
    }),
  )
}

function filaDatoResumen(
  etiqueta: string,
  celdaValor: CellObject,
  fondo: string,
  negrita = false,
): [CellObject, CellObject] {
  const estilo = {
    backgroundColor: fondo,
    ...(negrita ? { fontWeight: 'bold' as const, topBorderColor: CARBON, topBorderStyle: 'thin' as const } : {}),
    ...bordeCaja,
    height: 21,
  }
  return [
    texto(etiqueta, { ...estilo, align: 'left', indent: 1 }),
    { ...celdaValor, ...estilo },
  ]
}

function construirHojaResumen(reporte: MonthlyReport) {
  const negocioNombre = (reporte.business.name.trim() || 'PUNTO MOTO').toUpperCase()
  const mes = tituloMes(reporte.month)
  const datosNegocio = [
    reporte.business.tax_id ? `NIT/CC ${reporte.business.tax_id}` : '',
    reporte.business.phone ? `Tel. ${reporte.business.phone}` : '',
    reporte.business.address,
  ]
    .filter(Boolean)
    .join(' · ')
  const subtitulo = [
    datosNegocio,
    `Período: ${reporte.date_from} a ${reporte.date_to}`,
  ]
    .filter(Boolean)
    .join('   |   ')

  const vacia = texto('', { height: 21 })

  // Dos columnas paralelas de tarjetas de resumen: columnas 0..1 (izquierda) | col 2 separador | cols 3..4 (derecha)
  const data: Row[] = [
    ...encabezadoBanner(`${negocioNombre} — RECUENTO MENSUAL (${mes})`, subtitulo, 5),
    // Fila de tarjetas KPI destacadas (3 KPI en 5 columnas? Mejor 2 pares anchos con columna separadora en medio)
    [
      texto('VENTAS NETAS DEL MES', {
        columnSpan: 2,
        fontSize: 9,
        fontWeight: 'bold',
        textColor: TINTA_SUAVE,
        backgroundColor: CREMA,
        topBorderColor: CARBON,
        topBorderStyle: 'medium',
        leftBorderColor: BORDE,
        leftBorderStyle: 'thin',
        rightBorderColor: BORDE,
        rightBorderStyle: 'thin',
        height: 18,
        indent: 1,
      }),
      null,
      texto('', { height: 18 }),
      texto('TOTAL COBRADO (EFECTIVO / TRANSF.)', {
        columnSpan: 2,
        fontSize: 9,
        fontWeight: 'bold',
        textColor: TINTA_SUAVE,
        backgroundColor: CREMA,
        topBorderColor: CARBON,
        topBorderStyle: 'medium',
        leftBorderColor: BORDE,
        leftBorderStyle: 'thin',
        rightBorderColor: BORDE,
        rightBorderStyle: 'thin',
        height: 18,
        indent: 1,
      }),
      null,
    ],
    [
      pesos(reporte.sales.net_total, {
        columnSpan: 2,
        fontSize: 16,
        fontWeight: 'bold',
        align: 'left',
        backgroundColor: LIMA_SUAVE,
        leftBorderColor: BORDE,
        leftBorderStyle: 'thin',
        rightBorderColor: BORDE,
        rightBorderStyle: 'thin',
        bottomBorderColor: BORDE,
        bottomBorderStyle: 'thin',
        height: 30,
        indent: 1,
      }),
      null,
      texto('', { height: 30 }),
      pesos(reporte.sales.cash_total + reporte.sales.transfer_total, {
        columnSpan: 2,
        fontSize: 16,
        fontWeight: 'bold',
        align: 'left',
        backgroundColor: LIMA_SUAVE,
        leftBorderColor: BORDE,
        leftBorderStyle: 'thin',
        rightBorderColor: BORDE,
        rightBorderStyle: 'thin',
        bottomBorderColor: BORDE,
        bottomBorderStyle: 'thin',
        height: 30,
        indent: 1,
      }),
      null,
    ],
    [{ value: '', height: 12 }],
    // Bloque 1: Ventas vs Medios de pago & Caja
    [
      texto('VENTAS Y DEVOLUCIONES', {
        columnSpan: 2,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: CARBON,
        height: 23,
        indent: 1,
      }),
      null,
      vacia,
      texto('MEDIOS DE PAGO Y CAJA', {
        columnSpan: 2,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: CARBON,
        height: 23,
        indent: 1,
      }),
      null,
    ],
    [
      ...filaDatoResumen('Ventas vigentes realizadas', numero(reporte.sales.count), PAPEL),
      vacia,
      ...filaDatoResumen('Neto cobrado en efectivo', pesos(reporte.sales.cash_total), PAPEL),
    ],
    [
      ...filaDatoResumen('Ventas anuladas', numero(reporte.sales.voided_count), CEBRA),
      vacia,
      ...filaDatoResumen('Neto cobrado por transferencia', pesos(reporte.sales.transfer_total), CEBRA),
    ],
    [
      ...filaDatoResumen(
        `Productos (${reporte.sales.products_quantity} uds)`,
        pesos(reporte.sales.products_total),
        PAPEL,
      ),
      vacia,
      ...filaDatoResumen('Jornadas de caja abiertas', numero(reporte.cash.sessions_count), PAPEL),
    ],
    [
      ...filaDatoResumen(
        `Servicios taller (${reporte.sales.services_count})`,
        pesos(reporte.sales.services_total),
        CEBRA,
      ),
      vacia,
      ...filaDatoResumen('Gastos registrados en caja', pesos(reporte.cash.expenses_total), CEBRA),
    ],
    [
      ...filaDatoResumen('Venta bruta antes de devoluciones', pesos(reporte.sales.gross_total), PAPEL),
      vacia,
      ...filaDatoResumen('Retiros del dueño', pesos(reporte.cash.owner_withdrawals_total), PAPEL),
    ],
    [
      ...filaDatoResumen(
        `Devoluciones (${reporte.sales.returns_count})`,
        pesos(reporte.sales.returns_total),
        CEBRA,
      ),
      vacia,
      ...filaDatoResumen('Entradas totales a caja', pesos(reporte.cash.incoming_total), CEBRA),
    ],
    [
      ...filaDatoResumen('VENTA NETA DEL MES', pesos(reporte.sales.net_total), LIMA_SUAVE, true),
      vacia,
      ...filaDatoResumen('Salidas totales de caja', pesos(reporte.cash.outgoing_total), PAPEL, true),
    ],
    [{ value: '', height: 12 }],
    // Bloque 2: Taller vs Compras y Consignaciones
    [
      texto('TALLER MECÁNICO', {
        columnSpan: 2,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: CARBON,
        height: 23,
        indent: 1,
      }),
      null,
      vacia,
      texto('COMPRAS Y CONSIGNACIONES', {
        columnSpan: 2,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: CARBON,
        height: 23,
        indent: 1,
      }),
      null,
    ],
    [
      ...filaDatoResumen('Liquidaciones pagadas', numero(reporte.workshop.settlements_count), PAPEL),
      vacia,
      ...filaDatoResumen('Compras recibidas en el mes', numero(reporte.purchases.received_count), PAPEL),
    ],
    [
      ...filaDatoResumen('Mano de obra liquidada', pesos(reporte.workshop.labor_total), CEBRA),
      vacia,
      ...filaDatoResumen('Total compras recibidas', pesos(reporte.purchases.received_total), CEBRA),
    ],
    [
      ...filaDatoResumen('Pagado a mecánicos', pesos(reporte.workshop.mechanic_paid_total), PAPEL),
      vacia,
      ...filaDatoResumen('Abonos pagados a proveedores', pesos(reporte.purchases.payments_total), PAPEL),
    ],
    [
      ...filaDatoResumen('Descuentos aplicados', pesos(reporte.workshop.deductions_total), CEBRA),
      vacia,
      ...filaDatoResumen('Entregas en consignación', numero(reporte.consignments.deliveries_count), CEBRA),
    ],
    [
      ...filaDatoResumen('Ganancia del taller (mano de obra)', pesos(reporte.workshop.shop_share_total), LIMA_SUAVE, true),
      vacia,
      ...filaDatoResumen('Reportes y pagos de locales', pesos(reporte.consignments.payments_total), PAPEL, true),
    ],
  ]

  return {
    sheet: 'Resumen del mes',
    orientation: 'landscape' as const,
    showGridLines: false,
    columns: [
      { width: 34 },
      { width: 18 },
      { width: 4 },
      { width: 34 },
      { width: 18 },
    ],
    data,
  }
}

function construirHojaPorDia(reporte: MonthlyReport) {
  const mes = tituloMes(reporte.month)
  const filas: Row[] = reporte.daily.map((dia, idx) => {
    const fondo = idx % 2 === 0 ? PAPEL : CEBRA
    return [
      texto(dia.date, { backgroundColor: fondo, ...bordeCaja, height: 20, indent: 1 }),
      numero(dia.sales_count, FORMATO_ENTERO, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      pesos(dia.gross_total, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      pesos(dia.returns_total, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      pesos(dia.net_total, { backgroundColor: fondo, fontWeight: 'bold', ...bordeCaja, height: 20 }),
    ]
  })

  if (filas.length === 0) {
    filas.push(
      rellenoSpanned(5, texto('Sin ventas registradas en este mes.', { fontStyle: 'italic', textColor: TINTA_SUAVE, height: 22 })),
    )
  } else {
    const totalVentas = reporte.daily.reduce((s, d) => s + d.sales_count, 0)
    const totalBruto = reporte.daily.reduce((s, d) => s + d.gross_total, 0)
    const totalDev = reporte.daily.reduce((s, d) => s + d.returns_total, 0)
    const totalNeto = reporte.daily.reduce((s, d) => s + d.net_total, 0)
    filas.push([
      texto('TOTAL DEL MES', { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, topBorderColor: CARBON, topBorderStyle: 'medium', ...bordeCaja, height: 22, indent: 1 }),
      numero(totalVentas, FORMATO_ENTERO, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, topBorderColor: CARBON, topBorderStyle: 'medium', ...bordeCaja, height: 22 }),
      pesos(totalBruto, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, topBorderColor: CARBON, topBorderStyle: 'medium', ...bordeCaja, height: 22 }),
      pesos(totalDev, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, topBorderColor: CARBON, topBorderStyle: 'medium', ...bordeCaja, height: 22 }),
      pesos(totalNeto, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, topBorderColor: CARBON, topBorderStyle: 'medium', ...bordeCaja, height: 22 }),
    ])
  }

  return {
    sheet: 'Por día',
    showGridLines: false,
    stickyRowsCount: 4,
    columns: [{ width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }],
    data: [
      ...encabezadoBanner(`VENTAS DIARIAS — ${mes.toUpperCase()}`, `${reporte.date_from} a ${reporte.date_to}`, 5),
      filaTablaEncabezado(['Fecha', 'Ventas', 'Venta bruta', 'Devoluciones', 'Venta neta'], 1),
      ...filas,
    ],
  }
}

function construirHojaTiposYServicios(reporte: MonthlyReport) {
  const mes = tituloMes(reporte.month)
  const filasCategorias: Row[] = reporte.categories.map((c, idx) => {
    const fondo = idx % 2 === 0 ? PAPEL : CEBRA
    return [
      texto(c.name, { backgroundColor: fondo, ...bordeCaja, height: 20, indent: 1 }),
      numero(c.quantity, FORMATO_ENTERO, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      pesos(c.total, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
    ]
  })
  const filasServicios: Row[] = reporte.services.map((s, idx) => {
    const fondo = idx % 2 === 0 ? PAPEL : CEBRA
    return [
      texto(s.name, { backgroundColor: fondo, ...bordeCaja, height: 20, indent: 1 }),
      numero(s.count, FORMATO_ENTERO, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      pesos(s.total, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
    ]
  })

  const data: Row[] = [
    ...encabezadoBanner(`TIPOS Y SERVICIOS — ${mes.toUpperCase()}`, 'Totales netos descontando anulaciones y devoluciones', 3),
    seccionTitulo('Por tipo de producto', 3),
    filaTablaEncabezado(['Tipo', 'Unidades', 'Recaudado'], 1),
    ...(filasCategorias.length > 0
      ? [
          ...filasCategorias,
          [
            texto('TOTAL PRODUCTOS', { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22, indent: 1 }),
            numero(reporte.sales.products_quantity, FORMATO_ENTERO, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
            pesos(reporte.sales.products_total, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
          ],
        ]
      : [rellenoSpanned(3, texto('No se vendieron productos en este mes.', { fontStyle: 'italic', textColor: TINTA_SUAVE, height: 21 }))]),
    [{ value: '', height: 14 }],
    seccionTitulo('Por servicio de taller', 3),
    filaTablaEncabezado(['Servicio', 'Cantidad', 'Recaudado'], 1),
    ...(filasServicios.length > 0
      ? [
          ...filasServicios,
          [
            texto('TOTAL SERVICIOS', { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22, indent: 1 }),
            numero(reporte.sales.services_count, FORMATO_ENTERO, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
            pesos(reporte.sales.services_total, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
          ],
        ]
      : [rellenoSpanned(3, texto('No se realizaron servicios en este mes.', { fontStyle: 'italic', textColor: TINTA_SUAVE, height: 21 }))]),
  ]

  return {
    sheet: 'Tipos y servicios',
    showGridLines: false,
    columns: [{ width: 34 }, { width: 16 }, { width: 20 }],
    data,
  }
}

function construirHojaProductos(reporte: MonthlyReport) {
  const mes = tituloMes(reporte.month)
  const filas: Row[] = reporte.products.map((p, idx) => {
    const fondo = idx % 2 === 0 ? PAPEL : CEBRA
    return [
      texto(p.code, { backgroundColor: fondo, ...bordeCaja, height: 20, indent: 1 }),
      texto(p.name, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      texto(p.category_name, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      numero(p.quantity, FORMATO_ENTERO, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      pesos(p.total, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
    ]
  })

  return {
    sheet: 'Productos vendidos',
    showGridLines: false,
    stickyRowsCount: 4,
    columns: [{ width: 16 }, { width: 38 }, { width: 22 }, { width: 14 }, { width: 18 }],
    data: [
      ...encabezadoBanner(`PRODUCTOS VENDIDOS — ${mes.toUpperCase()}`, 'Ordenados de mayor a menor recaudo', 5),
      filaTablaEncabezado(['Código', 'Producto', 'Tipo', 'Unidades', 'Recaudado'], 3),
      ...(filas.length > 0
        ? [
            ...filas,
            [
              texto('TOTAL', { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22, indent: 1 }),
              texto('', { backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
              texto('', { backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
              numero(reporte.sales.products_quantity, FORMATO_ENTERO, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
              pesos(reporte.sales.products_total, { fontWeight: 'bold', backgroundColor: LIMA_SUAVE, ...bordeCaja, height: 22 }),
            ],
          ]
        : [rellenoSpanned(5, texto('Sin productos vendidos en este mes.', { fontStyle: 'italic', textColor: TINTA_SUAVE, height: 22 }))]),
    ],
  }
}

function construirHojaPorReponer(reporte: MonthlyReport) {
  const filas: Row[] = reporte.low_stock.map((p, idx) => {
    const fondo = idx % 2 === 0 ? PAPEL : CEBRA
    const agotado = p.stock <= 0
    return [
      texto(p.code, { backgroundColor: fondo, ...bordeCaja, height: 20, indent: 1 }),
      texto(p.name, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      numero(p.stock, FORMATO_ENTERO, { backgroundColor: fondo, fontWeight: 'bold', ...bordeCaja, height: 20 }),
      numero(p.min_stock, FORMATO_ENTERO, { backgroundColor: fondo, ...bordeCaja, height: 20 }),
      texto(agotado ? 'Agotado' : 'Stock bajo', {
        fontWeight: 'bold',
        align: 'center',
        backgroundColor: agotado ? ROJO_FONDO : AMBAR_FONDO,
        textColor: agotado ? ROJO_TINTA : AMBAR_TINTA,
        ...bordeCaja,
        height: 20,
      }),
    ]
  })

  return {
    sheet: 'Por reponer',
    showGridLines: false,
    stickyRowsCount: 4,
    columns: [{ width: 16 }, { width: 38 }, { width: 15 }, { width: 15 }, { width: 16 }],
    data: [
      ...encabezadoBanner('PRODUCTOS POR REPONER', 'Referencias activas en mínimo o agotadas al corte', 5),
      filaTablaEncabezado(['Código', 'Producto', 'Existencias', 'Mínimo', 'Estado'], 2),
      ...(filas.length > 0
        ? filas
        : [rellenoSpanned(5, texto('Inventario al día: no hay referencias bajo mínimo.', { fontStyle: 'italic', textColor: TINTA_SUAVE, height: 22 }))]),
    ],
  }
}

export type HojaConstruida = Parameters<typeof writeXlsxFile>[0][number] & { data: Row[] }

/** Prepara las 5 hojas diseñadas del recuento mensual para `.xlsx`. */
export function construirHojasMensuales(reporte: MonthlyReport): HojaConstruida[] {
  return [
    construirHojaResumen(reporte),
    construirHojaPorDia(reporte),
    construirHojaTiposYServicios(reporte),
    construirHojaProductos(reporte),
    construirHojaPorReponer(reporte),
  ]
}

/** Genera y descarga el libro `.xlsx` del recuento mensual con diseño corporativo de Punto Moto. */
export async function exportarRecuentoMensual(reporte: MonthlyReport): Promise<void> {
  const hojas = construirHojasMensuales(reporte)
  await writeXlsxFile(hojas).toFile(`recuento-mensual-${reporte.month}.xlsx`)
}
