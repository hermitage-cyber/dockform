#!/usr/bin/env python3
"""Пересборка manifest.json: SHA-256 для каждого файла в templates/ и dictionaries/.

Запускать ОБЯЗАТЕЛЬНО перед коммитом, если менялся хоть один шаблон или справочник —
иначе у пользователей обновление не сработает (Rust-updater сравнивает remote-манифест
с локальным кешем по хешам).

Использование:
    python scripts/build_manifest.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "manifest.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def collect(base: Path) -> dict[str, str]:
    """Собирает {relative_path: sha256} для всех файлов в base, рекурсивно.

    Пропускает скрытые файлы (.gitkeep, .DS_Store, …) — они мусор с точки зрения
    распространяемых артефактов и не должны попадать к пользователям через updater.
    """
    out: dict[str, str] = {}
    if not base.exists():
        return out
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        if any(part.startswith(".") for part in p.relative_to(base).parts):
            continue
        out[p.relative_to(base).as_posix()] = sha256(p)
    return out


def main() -> None:
    manifest = {
        "templates": collect(ROOT / "templates"),
        "dictionaries": collect(ROOT / "dictionaries"),
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    total = sum(len(s) for s in manifest.values())
    print(f"manifest.json: {total} файлов")
    for section, files in manifest.items():
        for rel, sha in files.items():
            print(f"  {section}/{rel}  {sha[:12]}…")


if __name__ == "__main__":
    main()
