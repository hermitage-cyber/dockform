import { describe, expect, it } from "vitest";
import { validateWizard } from "./wizard-validator";
import type { TemplateConfig, WizardConfig } from "@/types";

const wizard: WizardConfig = {
  axes: ["закон", "процедура", "тип_поставки", "количество_частичных"],
  questions: [
    {
      id: "закон",
      label: "Закон",
      options: [
        { value: 44, label: "44-ФЗ" },
        { value: 223, label: "223-ФЗ" },
      ],
    },
    {
      id: "процедура",
      label: "Процедура",
      options: [
        { value: "аукцион", label: "Аукцион" },
        { value: "ед_поставщик", label: "Ед. поставщик" },
      ],
    },
    {
      id: "тип_поставки",
      label: "Тип поставки",
      options: [
        { value: "первая", label: "Первая" },
        { value: "частичные", label: "Частичные" },
      ],
    },
    {
      id: "количество_частичных",
      label: "Сколько частичных",
      visible_if: "тип_поставки == 'частичные'",
      options: [
        { value: 1, label: "Одна" },
        { value: 2, label: "Две" },
      ],
    },
  ],
};

function tpl(template: string, tags: Record<string, string | number>): TemplateConfig {
  return {
    id: template,
    template,
    title: template,
    output_filename: { pattern: "out.docx", fields: [] },
    fields: [],
    tags,
  };
}

describe("validateWizard", () => {
  it("корректная ветвь «первая» без количество_частичных — ок", () => {
    const errors = validateWizard(wizard, [
      tpl("a.docx", { закон: 44, процедура: "аукцион", тип_поставки: "первая" }),
    ]);
    expect(errors).toEqual([]);
  });

  it("ветвь «частичные» с количество_частичных — ок", () => {
    const errors = validateWizard(wizard, [
      tpl("b.docx", {
        закон: 44,
        процедура: "аукцион",
        тип_поставки: "частичные",
        количество_частичных: 2,
      }),
    ]);
    expect(errors).toEqual([]);
  });

  it("количество_частичных при «первая» — лишняя ось", () => {
    const errors = validateWizard(wizard, [
      tpl("c.docx", {
        закон: 44,
        процедура: "аукцион",
        тип_поставки: "первая",
        количество_частичных: 1,
      }),
    ]);
    expect(errors.some((e) => /количество_частичных.*неприменима/.test(e))).toBe(true);
  });

  it("частичные без количество_частичных — не хватает оси", () => {
    const errors = validateWizard(wizard, [
      tpl("d.docx", { закон: 44, процедура: "аукцион", тип_поставки: "частичные" }),
    ]);
    expect(errors.some((e) => /требуется ось «количество_частичных»/.test(e))).toBe(true);
  });

  it("необъявленная ось → ошибка", () => {
    const errors = validateWizard(wizard, [
      tpl("e.docx", {
        закон: 44,
        процедура: "аукцион",
        тип_поставки: "первая",
        регион: "Москва",
      }),
    ]);
    expect(errors.some((e) => /«регион» не объявлена в axes/.test(e))).toBe(true);
  });

  it("значение вне вариантов вопроса → ошибка", () => {
    const errors = validateWizard(wizard, [
      tpl("f.docx", { закон: 99, процедура: "аукцион", тип_поставки: "первая" }),
    ]);
    expect(errors.some((e) => /значение «99».*отсутствует среди вариантов/.test(e))).toBe(true);
  });

  it("два шаблона с одинаковыми тегами → коллизия", () => {
    const t = { закон: 44, процедура: "аукцион", тип_поставки: "первая" };
    const errors = validateWizard(wizard, [tpl("g1.docx", t), tpl("g2.docx", { ...t })]);
    expect(errors.some((e) => /одинаковый набор тегов/.test(e))).toBe(true);
  });
});
