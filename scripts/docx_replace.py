#!/usr/bin/env python3
"""Замена готового текста в .docx с учётом дробления на runs.

Зачем отдельный скрипт: Word режет текст на узлы `w:t` произвольно — по
форматированию, по правкам, по проверке орфографии. Поэтому фраза «ИНН {инн}»
может лежать в трёх разных узлах, и обычный поиск-замена по XML её не находит.
Скрипт склеивает текст всех `w:t`, ищет по склейке, а результат раскладывает
обратно: весь новый текст попадает в первый затронутый узел, остальные
затронутые очищаются. Форматирование первого узла сохраняется.

Отличие от `replace_placeholders.py`: тот переводит разметку юриста
(`<значение>`, `<если:поле>`) в синтаксис docxtemplater по позициям. Здесь —
точечная замена известной строки на известную строку, для правок текста
шаблонов (сменить формулировку, обернуть поле в условный блок).

Ограничение: замена не переносится через границу абзаца — ищите строку, целиком
лежащую в одном абзаце.

CLI:
    python3 scripts/docx_replace.py "старый текст" "новый текст" file.docx [...]
    python3 scripts/docx_replace.py --dry-run "..." "..." file.docx

Перед записью рядом создаётся `<имя>.docx.bak`. После проверки результата
бэкапы удалить, в репозиторий они не нужны.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
import zipfile
from pathlib import Path

WT = re.compile(r"(<w:t(?:\s[^>]*)?>)(.*?)(</w:t>)", re.DOTALL)


def replace_in_xml(xml: str, old: str, new: str) -> tuple[str, int]:
    """Возвращает (новый xml, число замен).

    Поиск продолжается ПОСЛЕ вставленного текста, а не с начала: иначе замена
    вида «ИНН {инн}» → «…{/огрн}ИНН {инн}», где новая строка содержит старую,
    зациклилась бы навсегда.
    """
    count = 0
    start = 0
    while True:
        runs = list(WT.finditer(xml))
        joined = "".join(m.group(2) for m in runs)
        offsets, pos = [], 0
        for m in runs:
            offsets.append((pos, pos + len(m.group(2))))
            pos += len(m.group(2))

        idx = joined.find(old, start)
        if idx < 0:
            return xml, count
        end = idx + len(old)
        start = idx + len(new)  # следующий поиск — за вставкой

        hit = [i for i, (s, e) in enumerate(offsets) if s < end and e > idx]
        if not hit:
            return xml, count
        first, last = hit[0], hit[-1]

        # Хвосты затронутых узлов, которые не входят в заменяемый кусок, надо
        # сохранить: слева от совпадения и справа от него.
        rebuilt = {first: joined[offsets[first][0]:idx] + new + joined[end:offsets[last][1]]}
        for i in hit[1:]:
            rebuilt[i] = ""

        out, cursor = [], 0
        for i, m in enumerate(runs):
            if i in rebuilt:
                out.append(xml[cursor:m.start(2)])
                out.append(rebuilt[i])
                cursor = m.end(2)
        out.append(xml[cursor:])
        xml = "".join(out)
        count += 1


def patch(path: Path, old: str, new: str, dry_run: bool) -> int:
    src = zipfile.ZipFile(path)
    items = {n: src.read(n) for n in src.namelist()}
    infos = src.infolist()
    src.close()

    total = 0
    changed_parts = {}
    for name in items:
        # Колонтитулы и сноски — тоже word/*.xml, их правим наравне с телом.
        if not (name.startswith("word/") and name.endswith(".xml")):
            continue
        try:
            xml = items[name].decode("utf-8")
        except UnicodeDecodeError:
            continue
        xml, n = replace_in_xml(xml, old, new)
        if n:
            changed_parts[name] = xml.encode("utf-8")
            total += n
            print(f"  {path.name} [{name}] ×{n}")

    if not total:
        print(f"  {path.name}: совпадений нет")
        return 0
    if dry_run:
        return total

    items.update(changed_parts)
    shutil.copy2(path, str(path) + ".bak")
    # Пересобираем архив, сохраняя исходный порядок и метаданные записей.
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as out:
        for info in infos:
            out.writestr(info, items[info.filename])
    return total


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("old", help="что ищем")
    ap.add_argument("new", help="на что заменяем")
    ap.add_argument("files", nargs="+", type=Path, help=".docx файлы")
    ap.add_argument("--dry-run", action="store_true", help="только показать, не записывать")
    args = ap.parse_args()

    if not args.old:
        print("Пустая строка поиска.", file=sys.stderr)
        return 2

    total = 0
    for f in args.files:
        if not f.exists():
            print(f"  {f}: файл не найден", file=sys.stderr)
            continue
        total += patch(f, args.old, args.new, args.dry_run)

    print(f"\nВсего замен: {total}" + (" (dry-run, ничего не записано)" if args.dry_run else ""))
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
