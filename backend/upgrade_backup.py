"""Respaldo local previo a migrar una instalación existente."""
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import uuid


def backup_before_upgrade(data_dir: Path, version: str) -> Path:
    database = data_dir / "punto_moto.sqlite3"
    key = data_dir / "secret_key"
    if not database.is_file() or not key.is_file():
        raise FileNotFoundError("Faltan la base o la clave para respaldar antes de migrar.")
    destination = data_dir / "backups" / "pre-migration"
    destination.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".pending-", dir=destination))
    try:
        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as source:
            with closing(sqlite3.connect(staging / database.name)) as target:
                source.backup(target)
                integrity = target.execute("PRAGMA integrity_check").fetchall()
                if integrity != [("ok",)]:
                    raise RuntimeError("El respaldo no superó la comprobación de integridad.")
        shutil.copy2(key, staging / key.name)
        manifest = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "backend_version": version,
            "integrity": "ok",
            "sha256": {name: hashlib.sha256((staging / name).read_bytes()).hexdigest()
                       for name in [database.name, key.name]},
        }
        (staging / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        result = destination / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + uuid.uuid4().hex[:8])
        staging.rename(result)
        return result
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
