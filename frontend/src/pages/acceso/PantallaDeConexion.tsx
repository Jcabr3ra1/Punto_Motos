import { MarcoDeAcceso } from './MarcoDeAcceso'

export function Conectando() {
  return (
    <MarcoDeAcceso titulo="Conectando…" conEstado={false}>
      <p role="status" className="acceso__descripcion">
        Preparando el programa.
      </p>
    </MarcoDeAcceso>
  )
}

export function SinConexion({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <MarcoDeAcceso
      titulo="No hay conexión con el programa"
      conEstado={false}
      descripcion="Si el problema continúa, cierra y vuelve a abrir la aplicación."
    >
      <p role="alert" className="aviso aviso--error">
        {mensaje}
      </p>
      <button type="button" className="boton" onClick={onReintentar}>
        Reintentar
      </button>
    </MarcoDeAcceso>
  )
}
