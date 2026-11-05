import json
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from upgrade_backup import backup_before_upgrade


class UpgradeBackupTests(unittest.TestCase):
    def test_backup_includes_committed_wal_data_and_key(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            (data / "secret_key").write_text("clave-ficticia", encoding="utf-8")
            with closing(sqlite3.connect(data / "punto_moto.sqlite3")) as connection:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("CREATE TABLE prueba (name TEXT)")
                connection.execute("INSERT INTO prueba VALUES ('dato ficticio')")
                connection.commit()
                result = backup_before_upgrade(data, "0.8.0")
                with closing(sqlite3.connect(result / "punto_moto.sqlite3")) as copied:
                    self.assertEqual(copied.execute("SELECT name FROM prueba").fetchall(), [("dato ficticio",)])
            self.assertEqual((result / "secret_key").read_text(encoding="utf-8"), "clave-ficticia")
            manifest = json.loads((result / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["backend_version"], "0.8.0")
            self.assertEqual(manifest["integrity"], "ok")
            self.assertEqual(len(manifest["sha256"]["punto_moto.sqlite3"]), 64)

    def test_copy_failure_is_not_reported_as_success(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            sqlite3.connect(data / "punto_moto.sqlite3").close()
            (data / "secret_key").write_text("clave-ficticia", encoding="utf-8")
            with patch("upgrade_backup.shutil.copy2", side_effect=OSError("disco lleno")):
                with self.assertRaises(OSError):
                    backup_before_upgrade(data, "0.8.0")
            self.assertEqual(list((data / "backups" / "pre-migration").iterdir()), [])

    def test_missing_database_never_creates_an_empty_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(FileNotFoundError):
                backup_before_upgrade(Path(directory), "0.8.0")
            self.assertFalse((Path(directory) / "punto_moto.sqlite3").exists())
