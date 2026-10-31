"""Punto de entrada del sidecar: aplica migraciones y sirve la API con Waitress.

Tauri lo ejecuta así (y PyInstaller empaqueta este archivo):

    PUNTO_MOTO_DATA_DIR=<carpeta> PUNTO_MOTO_TOKEN=<credencial> backend --port 8765
"""
import argparse
import os
import sys

HOST = "127.0.0.1"


def main(argv=None):
    # Tauri lee esta salida como UTF-8; en Windows la consola usaría cp1252.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Backend local de Punto Moto")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PUNTO_MOTO_PORT", "8765")),
        help="puerto local donde escucha la API (por defecto 8765)",
    )
    parser.add_argument("--threads", type=int, default=4, help="hilos de Waitress")
    args = parser.parse_args(argv)

    if not os.environ.get("PUNTO_MOTO_TOKEN"):
        sys.exit("Falta PUNTO_MOTO_TOKEN: el backend no se inicia sin la credencial efímera.")

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    import django
    from django.core.management import call_command

    django.setup()
    # TODO: hacer un respaldo antes de migrar cuando exista el módulo de respaldos.
    call_command("migrate", interactive=False, verbosity=0)

    from waitress import serve

    from config.wsgi import application

    print(f"Punto Moto backend escuchando en http://{HOST}:{args.port}", flush=True)
    serve(application, host=HOST, port=args.port, threads=args.threads, ident="punto-moto")


if __name__ == "__main__":
    main()
