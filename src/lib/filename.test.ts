import { describe, expect, it } from "vitest";
import { buildFilename, sanitizeFilename } from "./filename";

describe("sanitizeFilename", () => {
  it("прямые кавычки → ёлочки (Windows их допускает)", () => {
    expect(sanitizeFilename('Претензия_ООО "Альфа"_2026.docx')).toBe(
      "Претензия_ООО «Альфа»_2026.docx",
    );
  });

  it("удаляет запрещённые Windows-символы", () => {
    expect(sanitizeFilename("a<b>c:d|e?f*g.docx")).toBe("abcdefg.docx");
    expect(sanitizeFilename("a/b\\c.docx")).toBe("abc.docx");
  });

  it("ёлочки и пробелы сохраняются", () => {
    expect(sanitizeFilename("Претензия ООО «Альфа» 2026.docx")).toBe(
      "Претензия ООО «Альфа» 2026.docx",
    );
  });
});

describe("buildFilename", () => {
  it("подстановка + кавычки в значении нормализуются", () => {
    const r = buildFilename(
      "Претензия_{наименование}_{date}.docx",
      ["наименование"],
      { "наименование": 'ООО "Альфа"' },
    );
    if (!r.ok) throw new Error("ожидал ok");
    expect(r.filename).toMatch(/^Претензия_ООО «Альфа»_\d{4}-\d{2}-\d{2}\.docx$/);
  });

  it("пустое обязательное поле → missing", () => {
    const r = buildFilename(
      "{наименование}.docx",
      ["наименование"],
      { "наименование": "" },
    );
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("должно было упасть");
    expect(r.missing).toEqual(["наименование"]);
  });
});
