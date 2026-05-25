import { describe, expect, it } from "vitest";
import { formatRubAmount, formatValuesForDocx, isoDateToRu } from "./format-ru";
import type { TemplateConfig } from "@/types";

describe("isoDateToRu", () => {
  it("YYYY-MM-DD → дд.мм.гггг", () => {
    expect(isoDateToRu("2026-02-15")).toBe("15.02.2026");
    expect(isoDateToRu("2026-01-01")).toBe("01.01.2026");
  });

  it("невалидный ввод возвращается как есть", () => {
    expect(isoDateToRu("15.02.2026")).toBe("15.02.2026");
    expect(isoDateToRu("")).toBe("");
    expect(isoDateToRu("not a date")).toBe("not a date");
  });
});

describe("formatRubAmount", () => {
  it("разделитель тысяч — NBSP, десятичный — запятая, всегда 2 знака", () => {
    expect(formatRubAmount(0)).toBe("0,00");
    expect(formatRubAmount(1234.5)).toBe("1 234,50");
    expect(formatRubAmount(1_000_000)).toBe("1 000 000,00");
  });
});

describe("formatValuesForDocx", () => {
  const template: TemplateConfig = {
    id: "t",
    template: "t.docx",
    title: "T",
    output_filename: { pattern: "{date}.docx", fields: [] },
    fields: [
      { name: "дата_договора", label: "дата", type: "date" },
      { name: "номер_договора", label: "номер", type: "text" },
      { name: "сумма", label: "сумма", type: "number" },
    ],
  };

  it("date-поля → дд.мм.гггг, остальные не трогаются", () => {
    const result = formatValuesForDocx(template, {
      "дата_договора": "2026-02-15",
      "номер_договора": "ABC-123",
      "сумма": 100_000,
    });
    expect(result).toEqual({
      "дата_договора": "15.02.2026",
      "номер_договора": "ABC-123",
      "сумма": 100_000,
    });
  });

  it("пустые/отсутствующие даты не падают", () => {
    const result = formatValuesForDocx(template, {
      "дата_договора": "",
    });
    expect(result["дата_договора"]).toBe("");
  });

  it("не мутирует исходный объект", () => {
    const input = { "дата_договора": "2026-02-15" };
    formatValuesForDocx(template, input);
    expect(input["дата_договора"]).toBe("2026-02-15");
  });
});
