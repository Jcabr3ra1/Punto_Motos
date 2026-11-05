# Paquete autocontenido: no incorpora .data, pruebas, claves ni entornos locales.
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

root = Path(SPECPATH)
a = Analysis(
    [str(root / "run.py")],
    pathex=[str(root)],
    binaries=[],
    datas=collect_data_files("apps", include_py_files=True) + collect_data_files("config", include_py_files=True),
    hiddenimports=collect_submodules("apps") + collect_submodules("config") + collect_submodules("rest_framework") + ["django.db.backends.sqlite3"],
    hookspath=[], hooksconfig={}, runtime_hooks=[],
    excludes=["tkinter", "unittest", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="backend", debug=False,
          bootloader_ignore_signals=False, strip=False, upx=False, console=True)
