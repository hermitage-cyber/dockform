#!/usr/bin/env python3
"""
Собирает минимальный валидный .docx без зависимостей (только стандартный zipfile).
Использовать для генерации тестовых шаблонов на этапах 2–4.

Использование:
    python3 scripts/make-minimal-docx.py <output.docx> "Текст с {placeholder}"

Если поставить docxtemplater-плейсхолдеры (одинарные фигурные скобки) — на этапе 4
docxtemplater их подхватит.
"""
import sys
import zipfile
from xml.sax.saxutils import escape


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""


def make_document_xml(paragraphs: list[str]) -> str:
    body = []
    for text in paragraphs:
        body.append(
            f"<w:p><w:r><w:t xml:space=\"preserve\">{escape(text)}</w:t></w:r></w:p>"
        )
    body_xml = "".join(body)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body>{body_xml}</w:body>'
        '</w:document>'
    )


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    out_path = sys.argv[1]
    paragraphs = sys.argv[2:]
    document_xml = make_document_xml(paragraphs)

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document_xml)

    print(f"OK: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
