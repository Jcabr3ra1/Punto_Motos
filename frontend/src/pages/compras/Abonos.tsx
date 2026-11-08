import { HandCoins } from 'lucide-react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listarAbonos, listarProveedores, type FiltrosDeAbonos } from '../../api/compras'
import { claves } from '../../api/consultas'
import { Campo } from '../../components/Campo'
import { CampoSelector } from '../../components/CampoSelector'
import { Cargando, ErrorDeCarga } from '../../components/EstadoDeCarga'
import { Paginacion } from '../../components/Paginacion'
import { PanelLateral } from '../../components/PanelLateral'
import { EncabezadoDePantalla } from '../../components/EncabezadoDePantalla'
import { FranjaDeIndicadores } from '../../components/FranjaDeIndicadores'
import { useConteo } from '../../hooks/useConteo'
import { DESTINOS } from '../../navegacion/destinos'
import { formatearPesos } from '../../utilidades/dinero'
import { formatearDia, hoyEnColombia } from '../../utilidades/fechas'
import { formatearNumero } from '../../utilidades/numeros'
import { useDeudaConProveedores } from './useDeudaConProveedores'
import { FormularioDeAbono } from './FormularioDeAbono'
import { EstadoVacio } from '../../components/EstadoVacio'

function leerFiltros(params: URLSearchParams): FiltrosDeAbonos {
  const proveedor = Number(params.get('supplier'))
  const pagina = Number(params.get('page'))
  return {
    supplier: Number.isInteger(proveedor) && proveedor > 0 ? proveedor : undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    page: Number.isInteger(pagina) && pagina > 1 ? pagina : undefined,
  }
}

// Abonos a proveedores (solo el dueño), del pago más reciente al más antiguo. No se editan ni se borran.
export function Abonos() {
  const [params, setParams] = useSearchParams()
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const filtros = leerFiltros(params)

  function cambiar(parcial: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(parcial)) {
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
    }
    if (!('page' in parcial)) siguiente.delete('page')
    setParams(siguiente, { replace: true })
  }

  const proveedores = useQuery({
    queryKey: [...claves.proveedores, { include_inactive: true }],
    queryFn: ({ signal }) => listarProveedores({ include_inactive: true }, signal),
  })
  const abonos = useQuery({
    queryKey: [...claves.abonos, filtros],
    queryFn: ({ signal }) => listarAbonos(filtros, signal),
    placeholderData: keepPreviousData,
  })

  const hayFiltros = Boolean(filtros.supplier || filtros.date_from || filtros.date_to)
  const inicioDelMes = `${hoyEnColombia().slice(0, 8)}01`
  const delMes = useConteo([...claves.abonos, 'mes', inicioDelMes], (signal) =>
    listarAbonos({ date_from: inicioDelMes, page_size: 1 }, signal),
  )
  const deuda = useDeudaConProveedores()

  return (
    <>
      <EncabezadoDePantalla
        icono={DESTINOS.abonos.icono}
        titulo="Abonos a proveedores"
        descripcion="Pagos a los proveedores. Se reparten entre sus compras pendientes, de la más antigua a la más nueva."
        acciones={
          <button
            type="button"
            className="boton boton--auto boton--con-icono"
            onClick={() => {
              setAviso(null)
              setRegistrando(true)
            }}
          >
            <HandCoins aria-hidden="true" size={16} />
            Registrar abono
          </button>
        }
      />
      <FranjaDeIndicadores
        indicadores={[
          { rotulo: 'Abonos este mes', valor: formatearNumero(delMes.data ?? 0), cargando: delMes.isPending, error: delMes.isError },
          { rotulo: 'Debo en total', valor: formatearPesos(deuda.total), cargando: deuda.cargando, error: deuda.error },
        ]}
      />
      {aviso && (
        <p role="status" className="aviso aviso--exito">
          {aviso}
        </p>
      )}
      <div className="filtros" role="search" aria-label="Filtrar abonos">
        <CampoSelector
          etiqueta="Proveedor"
          value={filtros.supplier ? String(filtros.supplier) : ''}
          onChange={(e) => cambiar({ supplier: e.target.value || undefined })}
          opciones={[
            { valor: '', texto: 'Todos los proveedores' },
            ...(proveedores.data ?? []).map((p) => ({ valor: String(p.id), texto: p.name })),
          ]}
        />
        <Campo
          etiqueta="Pagados desde"
          type="date"
          value={filtros.date_from ?? ''}
          onChange={(e) => cambiar({ date_from: e.target.value || undefined })}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={filtros.date_to ?? ''}
          onChange={(e) => cambiar({ date_to: e.target.value || undefined })}
        />
      </div>

      {abonos.isPending && <Cargando />}
      {abonos.isError && <ErrorDeCarga error={abonos.error} onReintentar={() => void abonos.refetch()} />}
      {abonos.isSuccess && (
        <>
          <p role="status" className="texto-suave">
            {abonos.data.count === 1 ? '1 abono' : `${formatearNumero(abonos.data.count)} abonos`}
          </p>
          {abonos.data.count === 0 ? (
            <EstadoVacio
              icono={DESTINOS.abonos.icono}
              mensaje={hayFiltros ? 'Ningún abono coincide con los filtros.' : 'Todavía no hay abonos.'}
            />
          ) : (
            <>
              <div className="tabla-contenedor">
                <table className="tabla">
                  <caption className="solo-lectores">Abonos a proveedores</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha de pago</th>
                      <th scope="col">Proveedor</th>
                      <th scope="col" className="tabla__numero">
                        Valor
                      </th>
                      <th scope="col">Medio</th>
                      <th scope="col">Aplicado a</th>
                      <th scope="col">Notas</th>
                      <th scope="col">Registró</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abonos.data.results.map((abono) => (
                      <tr key={abono.id}>
                        <td className="tabla__nowrap">{formatearDia(abono.paid_on)}</td>
                        <td>{abono.supplier.name}</td>
                        <td className="tabla__numero">{formatearPesos(abono.amount)}</td>
                        <td>{abono.method_label}</td>
                        <td>
                          {abono.allocations.map((reparto) => (
                            <span key={reparto.purchase} className="tabla__detalle">
                              <Link to={`/compras/lista/${reparto.purchase}`}>
                                {reparto.document_number || `Compra n.º ${reparto.purchase}`}
                              </Link>
                              : {formatearPesos(reparto.amount)}
                            </span>
                          ))}
                        </td>
                        <td>{abono.notes || '—'}</td>
                        <td>{abono.created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion
                etiqueta="Páginas de abonos"
                pagina={filtros.page ?? 1}
                total={abonos.data.count}
                hayAnterior={Boolean(abonos.data.previous)}
                haySiguiente={Boolean(abonos.data.next)}
                onCambiar={(pagina) => cambiar({ page: String(pagina) })}
              />
            </>
          )}
        </>
      )}
      {registrando && (
        <PanelLateral
          titulo="Registrar abono"
          modulo="Compras"
          descripcion="Pago a un proveedor; se reparte entre sus compras con saldo."
          onCerrar={() => setRegistrando(false)}
        >
          <FormularioDeAbono
            proveedorId={filtros.supplier}
            onTerminar={(mensaje) => {
              setAviso(mensaje)
              setRegistrando(false)
            }}
            onCancelar={() => setRegistrando(false)}
          />
        </PanelLateral>
      )}
    </>
  )
}
