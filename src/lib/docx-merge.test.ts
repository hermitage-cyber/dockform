import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { MergeError, mergeDocx } from "./docx-merge";

const DIR = "templates/pretenzii/";

function render(file: string): Uint8Array {
  const doc = new Docxtemplater(new PizZip(readFileSync(DIR + file)), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render({
    наименование_контрагента: "ООО «Ромашка»",
    подписант_должность: "по финансово-плановой работе",
    подписант_фио: "М.В. Антипова",
    подписант_фио_дат: "М.В. Антиповой",
    типовой_контракт: "Да",
  });
  return doc.getZip().generate({ type: "uint8array" });
}

function xmlOf(bytes: Uint8Array, part: string): string {
  return new PizZip(bytes).file(part)!.asText();
}

/// Теги сбалансированы — иначе Word не откроет файл.
function balanced(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>/g)) {
    if (m[0].startsWith("<?")) continue;
    if (m[3]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]);
  }
  return stack.length === 0;
}

const BUNDLES = [
  ["44_аук_единовр_пост_претензия.docx", "44_аук_единовр_пост_сз_счет.docx", "44_аук_единовр_пост_решение.docx"],
  ["44_аук_2част_пост_претензия.docx", "44_аук_част_пост_сз_счет.docx", "44_аук_част_пост_решение.docx"],
];

describe("mergeDocx", () => {
  for (const files of BUNDLES) {
    it(`${files[0]}: три раздела, бланк только у первого`, () => {
      const merged = mergeDocx(files.map(render));
      if (process.env.DOCKFORM_MERGE_OUT) writeFileSync(`${process.env.DOCKFORM_MERGE_OUT}/${files[0]}`, merged);
      const doc = xmlOf(merged, "word/document.xml");
      expect(balanced(doc)).toBe(true);

      // Три раздела: два разрыва в абзацах + итоговые параметры.
      const sections = doc.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!;
      expect(sections).toHaveLength(3);
      // Первый — бланк претензии, остальные — пустой нижний колонтитул.
      expect(sections[0]).toMatch(/<w:footerReference w:type="default" r:id="rId9"\/>/);
      for (const s of sections.slice(1)) {
        expect(s).toMatch(/<w:footerReference w:type="default" r:id="rIdDockformEmptyFtr"\/>/);
      }
      // Свои поля: претензия 2,5 см слева, СЗ и решение 3 см.
      expect(sections[0]).toMatch(/w:left="1418"/);
      expect(sections[1]).toMatch(/w:left="1701"/);
      expect(sections[2]).toMatch(/w:left="1701"/);

      expect(xmlOf(merged, "word/_rels/document.xml.rels")).toContain('Id="rIdDockformEmptyFtr"');
      expect(xmlOf(merged, "[Content_Types].xml")).toContain('PartName="/word/dockform-empty-footer.xml"');
      expect(balanced(xmlOf(merged, "word/styles.xml"))).toBe(true);

      // Текст всех трёх документов на месте и по порядку.
      const text = doc.replace(/<[^>]+>/g, "");
      const iClaim = text.indexOf("ЭЛЕКТРОННОЕ УВЕДОМЛЕНИЕ (ПРЕТЕНЗИЯ)");
      const iMemo = text.indexOf("СЛУЖЕБНАЯ ЗАПИСКА");
      const iDecision = text.indexOf("РЕШЕНИЕ");
      expect(iClaim).toBeGreaterThanOrEqual(0);
      expect(iMemo).toBeGreaterThan(iClaim);
      expect(iDecision).toBeGreaterThan(iMemo);
    });
  }

  it("интервалы СЗ из её настроек по умолчанию прописаны в абзацы", () => {
    const merged = mergeDocx(BUNDLES[0].map(render));
    const doc = xmlOf(merged, "word/document.xml");
    const memo = doc.slice(doc.indexOf("СЛУЖЕБНАЯ ЗАПИСКА") - 3000);
    // У СЗ по умолчанию after=160, line=259 — в претензии этих умолчаний нет.
    expect(memo).toMatch(/<w:spacing[^>]*w:after="160"/);
    expect(memo).toMatch(/<w:spacing[^>]*w:line="259"/);
  });

  it("неподдерживаемое содержимое — MergeError", () => {
    const zip = new PizZip(render(BUNDLES[0][1]));
    const xml = zip.file("word/document.xml")!.asText();
    zip.file("word/document.xml", xml.replace("<w:pPr>", "<w:pPr><w:numPr><w:numId w:val=\"1\"/></w:numPr>"));
    const withList = zip.generate({ type: "uint8array" });
    expect(() => mergeDocx([render(BUNDLES[0][0]), withList])).toThrow(MergeError);
    expect(() => mergeDocx([render(BUNDLES[0][0]), withList])).toThrow(/документ 2: не поддерживаются нумерованные списки/);
  });
});
