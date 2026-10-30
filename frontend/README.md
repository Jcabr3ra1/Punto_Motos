# Frontend

Responsable: **Juan**.

Interfaz de la aplicación en React y TypeScript. Se muestra dentro de la ventana de Tauri y consume la API local de Django; nunca accede directamente a la base de datos ni ejecuta SQL. Ver la [sección 7 del informe](../docs/informe_proyecto_taller.md#7-arquitectura-de-escritorio-y-alternativas).

## Tecnologías

- React con TypeScript.
- Cliente HTTP para la API `/api/v1` de Django.
- Respuestas simuladas según el contrato OpenAPI mientras el backend no esté listo.

## Responsabilidades

- Navegación y pantallas: inicio, catálogo e inventario, compras, ventas, servicios de taller, empleados, caja, cierres, reportes, configuración y respaldos.
- Venta rápida de mostrador con búsqueda, navegación con teclado y servicios con tipo, placa y mecánico.
- Pantalla de carga del inventario inicial y plantilla de conteo.
- Diseño del recibo de 80 mm y de la liquidación diaria, junto con la prueba física en la impresora.
- Configuración de respaldos, avisos del último respaldo externo y restauración guiada.
- Estados de carga, error y confirmación, distinguiendo borradores de operaciones confirmadas.

## Reglas de la interfaz

- Mostrar siempre los precios y totales confirmados por Django; el cálculo previo en pantalla es solo orientativo.
- Bloquear el doble clic y los reintentos accidentales en las confirmaciones, reutilizando la misma clave de reintento.
- Mostrar mensajes que expliquen qué se guardó o qué falta corregir, con errores por campo cuando la API los devuelva.
- Ocultar costos, ajustes y acciones según los permisos del usuario.

## Estructura propuesta

```text
frontend/
  src/
    api/          # cliente y tipos generados desde OpenAPI
    pages/        # una carpeta por módulo
    components/   # componentes compartidos
    hooks/
    mocks/        # respuestas simuladas del contrato
  package.json
```

## Entregables

- Pantallas integradas con la API real.
- Pruebas de interacción de los flujos de venta, servicio, devolución y cierres.
- Guía de uso para el dueño y los vendedores.

## Estado

Carpeta preparada. El código todavía no está implementado.
