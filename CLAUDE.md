# Punto Moto: reglas del proyecto

Sistema de gestión para tienda y taller de motos: Tauri 2 + React/TypeScript (Juan) y Django + SQLite (Alex). El informe funcional y técnico está en `docs/informe_proyecto_taller.md`.

## Documentar todo cambio del backend para el frontend

El equipo del frontend trabaja a partir de la documentación, no del código Django. Todo cambio en `backend/` se entrega con su documentación en el mismo commit:

1. **`docs/backend/API.md`**: actualizar el contrato de cada endpoint nuevo o modificado (método y ruta, campos de entrada y salida con tipos y reglas, ejemplos de solicitud y respuesta, errores posibles con su `code`, y el tipo TypeScript sugerido).
2. **`docs/backend/CAMBIOS.md`**: agregar una entrada arriba con la fecha, qué cambió y **qué debe hacer el frontend** (o "Ninguna acción para el frontend").
3. **`backend/README.md`**: actualizar si cambia cómo instalar, ejecutar o configurar el backend.

Un cambio que rompe el contrato (renombrar o quitar campos, cambiar tipos, códigos de error o rutas) se marca como **Cambio incompatible** en la bitácora y se avisa a Juan en el PR.

Escribir en español, con el mismo tono de los documentos existentes.

## Escritorio, instaladores y actualizaciones

Leer también [AGENTS.md](AGENTS.md) y [docs/PUBLICACION.md](docs/PUBLICACION.md). Modificar el código o subir commits no actualiza el programa instalado: se necesita una versión de escritorio superior y publicar la etiqueta correspondiente para que Actions genere la Release firmada. Se distribuyen juntos frontend, Django y escritorio.

No regenerar la clave de actualizaciones al clonar el repo ni cambiar el identificador o las rutas de datos. El secreto de firma de Actions ya está configurado; no se incluye en Git. El dueño decide cuándo instalar desde Inicio. La guía de publicación explica versiones, etiquetas, comprobaciones y recuperación.
