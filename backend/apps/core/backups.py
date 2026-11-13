"""Generación y verificación de copias de seguridad descargables de SQLite."""
from contextlib import closing
import hashlib
from pathlib import Path
import sqlite3
import tempfile

from django.conf import settings
from django.db import connection


def _copy_database(destination_path: Path) -> None:
    db_name = str(settings.DATABASES["default"]["NAME"])
    if db_name != ":memory:" and Path(db_name).is_file():
        source_uri = Path(db_name).resolve().as_uri() + "?mode=ro"
        with closing(sqlite3.connect(source_uri, uri=True)) as source:
            with closing(sqlite3.connect(destination_path)) as target:
                source.backup(target)
                integrity = target.execute("PRAGMA integrity_check").fetchall()
                if integrity != [("ok",)]:
                    raise RuntimeError("El respaldo no superó la comprobación de integridad.")
        return

    connection.ensure_connection()
    with closing(sqlite3.connect(destination_path)) as target:
        connection.connection.backup(target)
        integrity = target.execute("PRAGMA integrity_check").fetchall()
        if integrity != [("ok",)]:
            raise RuntimeError("El respaldo no superó la comprobación de integridad.")


def create_verified_backup_bytes() -> tuple[bytes, str]:
    """Genera una copia SQLite consistente, verifica su integridad y devuelve `(bytes, sha256)`."""
    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()
    try:
        _copy_database(tmp_path)
        data = tmp_path.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        return data, sha256
    finally:
        tmp_path.unlink(missing_ok=True)
