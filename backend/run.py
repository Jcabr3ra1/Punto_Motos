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
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding="utf-8")
    if sys.stderr is not None:
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

    from pathlib import Path
    data_dir = Path(os.environ.get("PUNTO_MOTO_DATA_DIR", Path(__file__).resolve().parent / ".data"))
    existing_database = (data_dir / "punto_moto.sqlite3").is_file()

    import django
    from django.core.management import call_command

    django.setup()
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor
    from django.conf import settings
    from upgrade_backup import backup_before_upgrade

    executor = MigrationExecutor(connection)
    if existing_database and executor.migration_plan(executor.loader.graph.leaf_nodes()):
        backup_before_upgrade(data_dir.resolve(), settings.APP_VERSION)
    call_command("migrate", interactive=False, verbosity=0)

    # Las sesiones no sobreviven al cierre del programa: al abrirlo hay que
    # iniciar sesión otra vez.
    from rest_framework.authtoken.models import Token

    Token.objects.all().delete()

    from waitress import serve

    from config.wsgi import application

    print(f"Punto Moto backend escuchando en http://{HOST}:{args.port}", flush=True)
    serve(application, host=HOST, port=args.port, threads=args.threads, ident="punto-moto")


if __name__ == "__main__":
    main()
