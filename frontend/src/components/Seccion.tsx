import { Outlet } from 'react-router'

/**
 * Sección del menú: el nombre va como título principal solo para lectores de pantalla (ya se ve en el menú y en la
 * barra superior) y cada pantalla pone su título visible.
 */
export function Seccion({ titulo }: { titulo: string }) {
  return (
    <section className="seccion">
      <h1 className="solo-lectores">{titulo}</h1>
      <Outlet />
    </section>
  )
}
