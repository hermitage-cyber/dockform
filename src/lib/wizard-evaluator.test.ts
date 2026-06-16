import { describe, expect, it } from "vitest";
import {
  getNextQuestion,
  getVisibleQuestions,
  matchTemplate,
  pruneAnswers,
} from "./wizard-evaluator";
import type { TemplateConfig, WizardConfig } from "@/types";

const wizard: WizardConfig = {
  axes: ["закон", "процедура", "тип_поставки", "количество_частичных"],
  questions: [
    { id: "закон", label: "Закон", options: [{ value: 44, label: "44" }] },
    { id: "процедура", label: "Процедура", options: [{ value: "аукцион", label: "Аукцион" }] },
    {
      id: "тип_поставки",
      label: "Тип",
      options: [
        { value: "первая", label: "Первая" },
        { value: "частичные", label: "Частичные" },
      ],
    },
    {
      id: "количество_частичных",
      label: "Сколько",
      visible_if: "тип_поставки == 'частичные'",
      options: [{ value: 1, label: "Одна" }],
    },
  ],
};

function tpl(template: string, tags: Record<string, string | number>): TemplateConfig {
  return { id: template, template, title: template, output_filename: { pattern: "x", fields: [] }, fields: [], tags };
}

describe("getNextQuestion", () => {
  it("первый вопрос при пустых ответах", () => {
    expect(getNextQuestion({}, wizard)?.id).toBe("закон");
  });

  it("пропускает отвеченные", () => {
    expect(getNextQuestion({ закон: 44, процедура: "аукцион" }, wizard)?.id).toBe("тип_поставки");
  });

  it("количество_частичных скрыт при «первая» → анкета завершена", () => {
    expect(
      getNextQuestion({ закон: 44, процедура: "аукцион", тип_поставки: "первая" }, wizard),
    ).toBeNull();
  });

  it("количество_частичных виден при «частичные»", () => {
    expect(
      getNextQuestion({ закон: 44, процедура: "аукцион", тип_поставки: "частичные" }, wizard)?.id,
    ).toBe("количество_частичных");
  });
});

describe("getVisibleQuestions", () => {
  it("при «первая» — 3 вопроса", () => {
    expect(getVisibleQuestions({ тип_поставки: "первая" }, wizard).map((q) => q.id)).toEqual([
      "закон",
      "процедура",
      "тип_поставки",
    ]);
  });
});

describe("pruneAnswers", () => {
  it("убирает ответ, ставший невидимым", () => {
    const pruned = pruneAnswers(
      { закон: 44, тип_поставки: "первая", количество_частичных: 2 },
      wizard,
    );
    expect(pruned).toEqual({ закон: 44, тип_поставки: "первая" });
  });
});

describe("matchTemplate", () => {
  const templates = [
    tpl("первая.docx", { закон: 44, процедура: "аукцион", тип_поставки: "первая" }),
    tpl("частичные.docx", {
      закон: 44,
      процедура: "аукцион",
      тип_поставки: "частичные",
      количество_частичных: 2,
    }),
  ];

  it("совпадение по всем тегам (число как строка)", () => {
    expect(
      matchTemplate({ закон: 44, процедура: "аукцион", тип_поставки: "первая" }, templates)?.template,
    ).toBe("первая.docx");
  });

  it("нет совпадения → null", () => {
    expect(
      matchTemplate({ закон: 223, процедура: "аукцион", тип_поставки: "первая" }, templates),
    ).toBeNull();
  });
});
