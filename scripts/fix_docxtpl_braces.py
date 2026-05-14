#!/usr/bin/env python3
"""Миграция .docx со старого синтаксиса docxtpl ({{ var }}) на docxtemplater ({var}).

Заодно склеивает плейсхолдеры, разорванные по нескольким <w:t> runs (типичная
проблема после ручных правок в Word). Сохраняет форматирование: подменяет
только текст внутри runs, структура XML не трогается.

Использование:
    python scripts/fix_docxtpl_braces.py templates/documentation/44_tovar_smp_ktru.docx
"""
from __future__ import annotations

import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

WT_RE = re.compile(r"<w:t(?:\s+[^>]*)?>([^<]*)</w:t>", re.DOTALL)
PLACEHOLDER_RE = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def fix_xml(text: str) -> tuple[str, list[str]]:
    """Возвращает (новый_xml, список_найденных_плейсхолдеров)."""
    runs = list(WT_RE.finditer(text))
    if not runs:
        return text, []

    # Склейка: проходим по тексту всех <w:t> подряд, как если бы это была одна строка.
    char_to_run: list[tuple[int, int]] = []
    combined_chars: list[str] = []
    for run_idx, m in enumerate(runs):
        for offset, ch in enumerate(m.group(1)):
            combined_chars.append(ch)
            char_to_run.append((run_idx, offset))
    combined = "".join(combined_chars)

    found: list[str] = []
    run_chars: dict[int, list[str]] = {i: list(runs[i].group(1)) for i in range(len(runs))}

    for ph in PLACEHOLDER_RE.finditer(combined):
        start, end = ph.start(), ph.end()
        name = ph.group(1).strip()
        found.append(name)
        # Очищаем все символы плейсхолдера во всех затронутых runs.
        for i in range(start, end):
            r_idx, off = char_to_run[i]
            run_chars[r_idx][off] = ""
        # В первый затронутый run кладём итоговый { имя } (одинарные скобки).
        first_r, first_off = char_to_run[start]
        run_chars[first_r][first_off] = "{" + name + "}"

    if not found:
        return text, []

    # Сшиваем обратно: оставляем XML как было, только заменяем содержимое каждого <w:t>.
    out: list[str] = []
    last = 0
    for run_idx, m in enumerate(runs):
        out.append(text[last : m.start(1)])
        out.append("".join(run_chars[run_idx]))
        last = m.end(1)
    out.append(text[last:])
    return "".join(out), found


def process(docx_path: Path) -> None:
    if not docx_path.exists():
        raise SystemExit(f"Not found: {docx_path}")

    backup = Path("/tmp") / (docx_path.stem + ".bak.docx")
    shutil.copy2(docx_path, backup)
    print(f"Backup: {backup}")

    tmp = Path("/tmp") / ("docx_fix_" + docx_path.stem)
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()

    with zipfile.ZipFile(docx_path, "r") as z:
        z.extractall(tmp)

    word_dir = tmp / "word"
    targets = ["document.xml"]
    for f in sorted(word_dir.iterdir()):
        if f.name.startswith(("header", "footer")) and f.suffix == ".xml":
            targets.append(f.name)

    all_found: list[str] = []
    for name in targets:
        fpath = word_dir / name
        if not fpath.exists():
            continue
        text = fpath.read_text(encoding="utf-8")
        new_text, found = fix_xml(text)
        if found:
            fpath.write_text(new_text, encoding="utf-8")
            print(f"  {name}: исправлено {len(found)} плейсхолдеров")
            all_found.extend(found)
        else:
            print(f"  {name}: без изменений")

    # Пересборка docx (zip).
    out_tmp = docx_path.with_suffix(".docx.tmp")
    with zipfile.ZipFile(out_tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for root, _dirs, files in os.walk(tmp):
            for fname in files:
                full = Path(root) / fname
                rel = full.relative_to(tmp)
                zout.write(full, str(rel).replace(os.sep, "/"))
    out_tmp.replace(docx_path)

    unique = sorted(set(all_found))
    print(f"\nГотово. Уникальных переменных: {len(unique)}")
    for v in unique:
        print(f"  {{{v}}}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/fix_docxtpl_braces.py <path/to/file.docx>")
        sys.exit(1)
    process(Path(sys.argv[1]))
