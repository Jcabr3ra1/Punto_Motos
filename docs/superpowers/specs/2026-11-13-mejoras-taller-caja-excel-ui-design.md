# Diseño · Mejoras de taller, caja, catálogo, exportación Excel y UI

**Fecha:** 2026-11-13
**Alcance:** Backend (`workshop`), documentación (`docs/backend/`) y Frontend (`taller`, `caja`, `productos`, `venta`, `inicio`, `estilos`, `acceso`, `utilidades/excel`).

## Alcance por punto

1. **Borrar mecánicos (`DELETE /mechanics/{id}`):**
   - Backend: `MechanicViewSet` hereda `DestroyModelMixin` con permiso `IsOwner`; si tiene historial (`ProtectedError` por servicios, liquidaciones o descuentos), responde 409 `mechanic_has_history`.
   - Frontend: botón eliminar (`Trash2`) en `Mecanicos.tsx` con confirmación y sugerencia de desactivar si tiene historial.
2. **Liquidación de mecánicos con servicios detallados y ventana interactiva:**
   - Backend: `MechanicSettlement.objects.preview(day)` incluye `services` (con `select_related("service_type", "sale__customer")`) y `SettlementPreviewSerializer` los expone usando `SettledServiceSerializer`.
   - Frontend: `LiquidacionDelDia.tsx` muestra los servicios resumidos en la tabla y abre una ventana interactiva (`VentanaDeDocumento`) al elegir un mecánico, donde se listan cada uno de sus servicios, sus descuentos pendientes, el cálculo neto, el selector de medio de pago y el botón de confirmar pago (mostrando luego `HojaDeLiquidacion`).
3. **Explicación visible al cerrar caja con diferencia:**
   - `CajaDeHoy.tsx`: el aviso tras cerrar la caja incluye `closing_notes`.
   - `ResumenDeCaja.tsx` (`CifrasDeCaja`): muestra un campo destacado «Explicación de la diferencia» (o «Nota del cierre») cuando la caja está cerrada y tiene `closing_notes`.
   - `FichaDeCaja.tsx`: etiqueta «Explicación de la diferencia» cuando `difference !== 0`.
4. **Quitar existencia mínima de la tabla de Productos:**
   - `ListaDeProductos.tsx` (`Medidor`): muestra solo la existencia actual (`{actual}`), conservando formulario, ficha y bloque de Inicio intactos.
5. **Mejorar descripciones de Tipos, Marcas y Motos:**
   - `destinos.ts` y `Catalogo.tsx`: textos claros con ejemplos prácticos de organización y búsqueda.
6. **Hover iluminado en botones y mayor visibilidad de enlaces en Inicio:**
   - `index.css`: `cursor: pointer`, transiciones suaves y resaltado/iluminación visible en `:hover` de botones, filtros y botones de icono; enlaces `.panel-inicio__enlace` con estilo más visible (fondo/borde sutil y contraste claro).
7. **Exportación `.xlsx` con `write-excel-file`:**
   - Utilidad común `frontend/src/utilidades/excel.ts` (`exportarExcel`) con encabezados en negrita y ancho automático de columnas.
   - Botón **Exportar Excel** en `ResumenDeVentas.tsx` (multi-hoja), `Ventas.tsx`, `Productos.tsx`, `CajasAnteriores.tsx` y `HistorialDeLiquidaciones.tsx`.
8. **Mensaje tranquilizador en arranque sin internet:**
   - `PantallaDeConexion.tsx`: indica que el sistema funciona local y sin internet y que el primer arranque puede tardar unos segundos.
