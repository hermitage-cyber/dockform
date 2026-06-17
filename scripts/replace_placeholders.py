#!/usr/bin/env python3
"""Автозамена разметки юриста в .docx на синтаксис docxtemplater.

Юрист готовит образец по конвенции (см. docs/template-authoring.md, раздел
«Разметка образца для автозамены»):

  • Подставляемое значение оборачивается в угловые скобки:
        <30.03.2026>  <ООО «Поставщик»>  <N 90 … от …>
    Скрипт заменяет i-й такой спан на i-й плейсхолдер из списка targets.

  • Условный/опциональный текст помечается маркерами-скобками:
        <если:обеспечение_нг>текст для «Да»<иначе>текст для «Нет»<конец>
        <если:почтовый_адрес>Почтовый адрес: <почтовый_адрес><конец>
    → превращается в  {#поле}…{/поле}{^поле}…{/поле}  и  {#поле}…{/поле}.
    Эти маркеры НЕ занимают позицию в targets.

  • Примечания юриста — родными комментариями Word (Рецензирование → Создать
    примечание). Они в отдельном файле, не печатаются и скриптом не трогаются.

Каждый «<» и «>» в Word может быть отдельным run'ом, может быть частью большего
run'а, а значение между ними — несколькими run'ами. Поэтому склеиваем текст всех
узлов w:t, ищем «<…>» регэкспом по склейке и переносим правки обратно в узлы —
это устойчиво к любому дроблению. Дерево XML не пересобираем (меньше риск сломать
совместимость .docx): правим только содержимое узлов w:t.

CLI:
    python3 replace_placeholders.py --check file.docx   # классифицировать спаны
"""

import html
import re
import sys
import zipfile

DOC_XML = "word/document.xml"
WT_RE = re.compile(r"<w:t(?: [^>]*)?>(.*?)</w:t>", re.S)
SPAN_RE = re.compile(r"<[^<>]*>")  # один маркер <…> без вложенности

IF_PREFIX = "если:"
ELSE_WORDS = ("иначе", "else")
END_WORDS = ("конец", "endif")


def _nodes(xml: str):
    """Узлы w:t: список (xml_start, xml_end, text). Плюс склейка и их границы."""
    nodes, full, ranges, pos = [], [], [], 0
    for m in WT_RE.finditer(xml):
        text = html.unescape(m.group(1))
        nodes.append((m.start(), m.end(), text))
        full.append(text)
        ranges.append((pos, pos + len(text)))
        pos += len(text)
    return nodes, "".join(full), ranges


def _classify_marker(inner: str, stack: list):
    """inner — текст между < и >. Возвращает (kind, repl|None)."""
    content = inner.strip()
    low = content.lower()
    if low.startswith(IF_PREFIX):
        name = content[len(IF_PREFIX):].strip()
        stack.append(name)
        return "cond", "{#%s}" % name
    if low in ELSE_WORDS:
        if not stack:
            raise ValueError("<иначе> без открытого <если:…>")
        return "cond", "{/%s}{^%s}" % (stack[-1], stack[-1])
    if low in END_WORDS:
        if not stack:
            raise ValueError("<конец> без открытого <если:…>")
        return "cond", "{/%s}" % stack.pop()
    return "value", None


def classify(xml: str):
    """Возвращает (value_contents, conditional_markers)."""
    _, full, _ = _nodes(xml)
    values, conds, stack = [], [], []
    for m in SPAN_RE.finditer(full):
        kind, repl = _classify_marker(m.group()[1:-1], stack)
        if kind == "cond":
            conds.append(repl)
        else:
            values.append(m.group()[1:-1].strip())
    if stack:
        raise ValueError(f"незакрытые <если:…>: {stack}")
    return values, conds


def transform(xml: str, value_targets) -> str:
    nodes, full, ranges = _nodes(xml)

    # Список правок в координатах склейки: (start, end, replacement).
    repls, ti, stack = [], iter(value_targets), []
    for m in SPAN_RE.finditer(full):
        kind, repl = _classify_marker(m.group()[1:-1], stack)
        if kind == "value":
            try:
                repl = next(ti)
            except StopIteration:
                raise ValueError(
                    f"спанов-значений больше, чем targets ({len(value_targets)})")
        repls.append((m.start(), m.end(), repl))
    if stack:
        raise ValueError(f"незакрытые <если:…>: {stack}")
    leftover = list(ti)
    if leftover:
        raise ValueError(f"targets не израсходованы ({len(leftover)} лишних)")

    def starts_at(gp):
        for a, b, r in repls:
            if a == gp:
                return r
        return None

    def inside(gp):
        return any(a <= gp < b for a, b, _ in repls)

    # Пересобираем текст каждого узла: вставляем плейсхолдер в позиции начала
    # маркера, символы внутри <…> выкидываем. Текст вне маркеров — как есть.
    edits = []
    for (xs, xe, text), (ns, ne) in zip(nodes, ranges):
        out = []
        for off in range(len(text)):
            gp = ns + off
            r = starts_at(gp)
            if r is not None:
                out.append(r)
            if inside(gp):
                continue
            out.append(text[off])
        # маркер может начинаться ровно на стыке (в конце узла) — это начало
        # следующего узла, не наше.
        new_inner = "".join(out)
        if new_inner != text:
            edits.append((xs, xe, f'<w:t xml:space="preserve">{html.escape(new_inner)}</w:t>'))

    for xs, xe, repl in sorted(edits, key=lambda e: e[0], reverse=True):
        xml = xml[:xs] + repl + xml[xe:]
    return xml


def process(path: str, value_targets, out_path: str = None):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        data = {n: z.read(n) for n in names}
    data[DOC_XML] = transform(data[DOC_XML].decode("utf-8"), value_targets).encode("utf-8")
    with zipfile.ZipFile(out_path or path, "w", zipfile.ZIP_DEFLATED) as z:
        for n in names:
            z.writestr(n, data[n])


def _check(path: str):
    with zipfile.ZipFile(path) as z:
        xml = z.read(DOC_XML).decode("utf-8")
    values, conds = classify(xml)
    print(f"Спаны-значения <…> ({len(values)}) — задать столько targets по порядку:")
    for i, v in enumerate(values):
        print(f"  {i:3} | {v!r}")
    if conds:
        print(f"\nУсловные маркеры ({len(conds)}, обрабатываются автоматически):")
        for c in conds:
            print(f"      {c}")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--check":
        _check(sys.argv[2])
    else:
        print(__doc__)
        sys.exit(1)
