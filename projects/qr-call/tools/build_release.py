"""Deterministic-ish source release builder; excludes runtime secrets and caches."""
from __future__ import annotations
import hashlib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.0'
INCLUDE = ['app', 'frontend', 'site', 'tests', 'tools', '.github',
           'README.md', 'IP_AND_USES.md', 'TERMS.md', 'LICENSE',
           '.gitignore', '.dockerignore', 'Dockerfile', 'compose.yaml',
           'Caddyfile', 'requirements.txt', 'requirements-test.txt']
IGNORE_NAMES = {'.git', '.venv', '__pycache__', '.pytest_cache', 'node_modules',
                'private_download', 'dist', '.env'}
IGNORE_EXT = {'.pyc', '.db', '.sqlite', '.sqlite3', '.zip'}


def build():
    files: list[Path] = []
    for item in INCLUDE:
        base = ROOT / item
        if not base.exists():
            raise FileNotFoundError(base)
        candidates = sorted(base.rglob('*')) if base.is_dir() else [base]
        for f in candidates:
            if not f.is_file():
                continue
            rel = f.relative_to(ROOT)
            if any(part in IGNORE_NAMES for part in rel.parts) or f.suffix in IGNORE_EXT:
                continue
            files.append(f)
    files = sorted(set(files), key=lambda f: f.relative_to(ROOT).as_posix())
    output = ROOT / 'private_download' / f'QR-Call-v{VERSION}.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in files:
            rel = file.relative_to(ROOT)
            info = zipfile.ZipInfo(f'QR-Call-v{VERSION}/{rel.as_posix()}', date_time=(2026, 11, 16, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    (output.parent / 'SHA256SUMS').write_text(f'{checksum}  {output.name}\n', encoding='utf-8')
    print(f'{output}\nsha256={checksum}\nfiles={len(files)}')
    return output, checksum


if __name__ == '__main__':
    build()
