import { describe, expect, it } from "vitest";
import { validateTemplate } from "./template-validator";
import type { FieldConfig, TemplateConfig } from "@/types";

function makeTemplate(fields: FieldConfig[]): TemplateConfig {
  return {
    id: "t",
    template: "тест.docx",
    title: "Тест",
    output_filename: { pattern: "out.docx", fields: [] },
    fields,
  };
}

// penalty_44fz_part6: inputs [сумма_контракта, дней_просрочки, ставка_цб],
// outputs [сумма_неустойки, расчёт_подробно] — зарегистрирован в реестре.
const validCalc: FieldConfig = {
  name: "неустойка_блок",
  label: "Неустойка",
  type: "calculator",
  calculator: "penalty_44fz_part6",
  inputs: {
    сумма_контракта: "сумма",
    дней_просрочки: "дней",
    ставка_цб: "ставка",
  },
  outputs: {
    сумма_неустойки: "итог",
    расчёт_подробно: "расчёт_текст",
  },
};

describe("validateTemplate — калькуляторы", () => {
  it("валидный калькулятор не даёт ошибок", () => {
    expect(validateTemplate(makeTemplate([validCalc]))).toEqual([]);
  });

  it("несуществующий калькулятор → ошибка с указанием файла", () => {
    const errors = validateTemplate(
      makeTemplate([{ ...validCalc, calculator: "нет_такого" }]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/тест\.docx/);
    expect(errors[0]).toMatch(/не найден в реестре/);
  });

  it("несовпадение inputs с метаданными → missing/extra", () => {
    const errors = validateTemplate(
      makeTemplate([
        {
          ...validCalc,
          inputs: { сумма_контракта: "сумма", лишний_вход: "x" },
        },
      ]),
    );
    expect(errors.some((e) => /не хватает.*дней_просрочки/.test(e))).toBe(true);
    expect(errors.some((e) => /лишние.*лишний_вход/.test(e))).toBe(true);
  });

  it("отсутствие блока outputs → ошибка", () => {
    const { outputs, ...noOutputs } = validCalc;
    void outputs;
    const errors = validateTemplate(makeTemplate([noOutputs]));
    expect(errors.some((e) => /требует блок outputs/.test(e))).toBe(true);
  });

  it("два калькулятора пишут в одну переменную → коллизия", () => {
    const second: FieldConfig = {
      ...validCalc,
      name: "неустойка_блок2",
      outputs: { сумма_неустойки: "итог", расчёт_подробно: "другой_текст" },
    };
    const errors = validateTemplate(makeTemplate([validCalc, second]));
    expect(errors.some((e) => /итог.*уже заполняется/.test(e))).toBe(true);
  });
});

describe("validateTemplate — extra_templates (8.8)", () => {
  const base = (extra: TemplateConfig["extra_templates"]): TemplateConfig => ({
    ...makeTemplate([]),
    template: "основной.docx",
    extra_templates: extra,
  });

  it("корректные доп. документы — ок", () => {
    const errors = validateTemplate(
      base([
        { template: "служебка1.docx", output_filename: { pattern: "с1.docx" } },
        { template: "служебка2.docx", output_filename: { pattern: "с2.docx" } },
      ]),
    );
    expect(errors).toEqual([]);
  });

  it("расширение не .docx → ошибка", () => {
    const errors = validateTemplate(
      base([{ template: "служебка.pdf", output_filename: { pattern: "с.docx" } }]),
    );
    expect(errors.some((e) => /должен иметь расширение \.docx/.test(e))).toBe(true);
  });

  it("дубль имени среди доп. документов → ошибка", () => {
    const errors = validateTemplate(
      base([
        { template: "служебка.docx", output_filename: { pattern: "a.docx" } },
        { template: "служебка.docx", output_filename: { pattern: "b.docx" } },
      ]),
    );
    expect(errors.some((e) => /указан дважды/.test(e))).toBe(true);
  });

  it("совпадение с основным → ошибка", () => {
    const errors = validateTemplate(
      base([{ template: "основной.docx", output_filename: { pattern: "x.docx" } }]),
    );
    expect(errors.some((e) => /указан дважды.*совпадает с основным/.test(e))).toBe(true);
  });
});

describe("validateTemplate — text_output", () => {
  const numberField: FieldConfig = {
    name: "сумма_контракта",
    label: "Сумма",
    type: "number",
    text_output: "сумма_прописью",
  };

  it("text_output у числового поля без конфликтов — ок", () => {
    expect(validateTemplate(makeTemplate([numberField]))).toEqual([]);
  });

  it("text_output: null (из Rust) — поле игнорируется, не ошибка", () => {
    // Rust сериализует пустой Option как null, а не как отсутствие ключа.
    const field = { name: "кому", label: "Кому", type: "textarea", text_output: null } as unknown as FieldConfig;
    expect(validateTemplate(makeTemplate([field]))).toEqual([]);
  });

  it("text_output не на number → ошибка", () => {
    const errors = validateTemplate(
      makeTemplate([{ ...numberField, type: "text" }]),
    );
    expect(errors.some((e) => /только для type: number/.test(e))).toBe(true);
  });

  it("text_output конфликтует с именем другого поля", () => {
    const other: FieldConfig = {
      name: "сумма_прописью",
      label: "Чужое поле",
      type: "text",
    };
    const errors = validateTemplate(makeTemplate([numberField, other]));
    expect(errors.some((e) => /конфликтует с именем другого поля/.test(e))).toBe(true);
  });
});
