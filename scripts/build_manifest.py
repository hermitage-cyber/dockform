#!/usr/bin/env python3
"""Пересборка manifest.json: SHA-256 для каждого файла в templates/ и dictionaries/.

Запускать ОБЯЗАТЕЛЬНО перед коммитом, если менялся хоть один шаблон или справочник —
иначе у пользователей обновление не сработает (Rust-updater сравнивает remote-манифест
с локальным кешем по хешам).

Поле `min_app_version` скрипт НЕ проставляет — только переносит из текущего
manifest.json, если оно там уже есть. Ставится оно руками и редко: см.
`docs/release.md`, раздел «Гейт совместимости». Автоматическая простановка (версия из
package.json при каждом прогоне) пробовалась и откачена — она замораживала доставку
шаблонов у всех, кто ещё не получил новый .exe, включая правки чистого текста, которые
на старой сборке отработали бы нормально.

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

    Пропускает:
      - скрытые файлы (.gitkeep, .DS_Store, …) — мусор с точки зрения артефактов;
      - временные блокировки Word `~$*.docx`/`~$*.doc` — они существуют, пока
        у юриста открыт документ, и их хеши не должны уезжать к пользователям;
      - папку `old/` на любом уровне — архив старых шаблонов, в репо нужен
        для истории, на флешку пилоту — нет;
      - `.md` файлы — служебные заметки разработчика (плейсхолдеры, разметка),
        пользователю не нужны.
    """
    out: dict[str, str] = {}
    if not base.exists():
        return out
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        rel_parts = p.relative_to(base).parts
        if any(part.startswith(".") for part in rel_parts):
            continue
        if any(part.startswith("~$") for part in rel_parts):
            continue
        if "old" in rel_parts:
            continue
        if p.suffix.lower() == ".md":
            continue
        out[p.relative_to(base).as_posix()] = sha256(p)
    return out


def existing_min_app_version() -> str | None:
    """Значение min_app_version из текущего manifest.json, если оно там есть.

    Скрипт переписывает манифест целиком, поэтому руками выставленное поле надо
    явно перенести — иначе очередной пересчёт хешей молча снял бы гейт.
    """
    if not MANIFEST.exists():
        return None
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    value = data.get("min_app_version")
    return value if isinstance(value, str) and value else None


def main() -> None:
    manifest: dict[str, object] = {
        "templates": collect(ROOT / "templates"),
        "dictionaries": collect(ROOT / "dictionaries"),
    }
    pinned = existing_min_app_version()
    if pinned:
        manifest["min_app_version"] = pinned

    MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    sections = {k: v for k, v in manifest.items() if isinstance(v, dict)}
    total = sum(len(s) for s in sections.values())
    gate = f", min_app_version={pinned} (перенесено)" if pinned else ""
    print(f"manifest.json: {total} файлов{gate}")
    for section, files in sections.items():
        for rel, sha in files.items():
            print(f"  {section}/{rel}  {sha[:12]}…")


if __name__ == "__main__":
    main()
