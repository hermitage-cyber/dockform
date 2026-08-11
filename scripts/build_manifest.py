#!/usr/bin/env python3
"""Пересборка manifest.json: SHA-256 для каждого файла в templates/ и dictionaries/.

Запускать ОБЯЗАТЕЛЬНО перед коммитом, если менялся хоть один шаблон или справочник —
иначе у пользователей обновление не сработает (Rust-updater сравнивает remote-манифест
с локальным кешем по хешам).

Помимо хешей проставляет `min_app_version` — версию из `package.json`. Приложение
старее этой версии не подменяет шаблоны у себя на диске, а показывает «обновите
dockform.exe». Так шаблоны не могут уехать к пилоту раньше сборки, которая умеет их
обработать (отзыв пилота 2026-08-10: старый .exe + новые .yaml = «лишние ключи» и
неоткрывающаяся форма).

Значение берётся из package.json, чтобы не поддерживать руками третий источник правды.
Следствие: подняли версию приложения — все, кто ещё на старой сборке, замирают на
текущих шаблонах до раздачи нового .exe. Это и есть желаемое поведение.

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


def app_version() -> str:
    """Версия приложения из package.json.

    Она же должна стоять в `src-tauri/Cargo.toml` и `src-tauri/tauri.conf.json` —
    порядок бампа описан в `docs/release.md`.
    """
    data = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    version = data.get("version")
    if not isinstance(version, str) or not version:
        raise SystemExit("package.json: не найдено поле version")
    return version


def main() -> None:
    version = app_version()
    manifest = {
        "min_app_version": version,
        "templates": collect(ROOT / "templates"),
        "dictionaries": collect(ROOT / "dictionaries"),
    }
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    sections = {k: v for k, v in manifest.items() if isinstance(v, dict)}
    total = sum(len(s) for s in sections.values())
    print(f"manifest.json: {total} файлов, min_app_version={version}")
    for section, files in sections.items():
        for rel, sha in files.items():
            print(f"  {section}/{rel}  {sha[:12]}…")


if __name__ == "__main__":
    main()
