import { getCalculator } from "@/lib/calculators";
import type { FieldConfig, TemplateConfig } from "@/types";

/**
 * Валидация шаблона при загрузке (этап 7.4 + 7.5.4).
 *
 * Проверяет согласованность YAML-конфига с реестром калькуляторов и правила
 * для text_output. Возвращает список понятных сообщений об ошибках; пустой
 * список — шаблон валиден. Каждое сообщение начинается с имени файла шаблона,
 * чтобы юрист сразу видел, какой `.yaml` чинить.
 *
 * Это статическая проверка структуры (не рантайм-расчёт): она не зависит от
 * введённых данных и должна прогоняться один раз при открытии шаблона.
 */
export function validateTemplate(template: TemplateConfig): string[] {
  const errors: string[] = [];
  const where = template.template || template.id;
  const prefix = `Шаблон «${where}»`;

  // Имена всех полей формы — для проверки коллизий text_output.
  const fieldNames = new Set(template.fields.map((f) => f.name));
  // Имена переменных, уже занятых производными выходами (text_output + outputs
  // калькуляторов). Нужны, чтобы два поля не писали в одну и ту же переменную.
  const producedVars = new Map<string, string>();

  for (const field of template.fields) {
    if (field.type === "calculator") {
      validateCalculatorField(field, prefix, producedVars, errors);
    }
    if (field.text_output !== undefined) {
      validateTextOutput(field, prefix, fieldNames, producedVars, errors);
    }
  }

  return errors;
}

function validateCalculatorField(
  field: FieldConfig,
  prefix: string,
  producedVars: Map<string, string>,
  errors: string[],
): void {
  const at = `${prefix}, поле «${field.name}»`;

  if (!field.calculator) {
    errors.push(`${at}: тип calculator, но не указан атрибут calculator.`);
    return;
  }

  const def = getCalculator(field.calculator);
  if (!def) {
    errors.push(`${at}: калькулятор «${field.calculator}» не найден в реестре.`);
    return;
  }

  if (!field.inputs) {
    errors.push(`${at}: калькулятор «${field.calculator}» требует блок inputs.`);
  } else {
    reportSetMismatch(
      `${at}: inputs`,
      Object.keys(field.inputs),
      def.inputs,
      errors,
    );
  }

  if (!field.outputs) {
    errors.push(`${at}: калькулятор «${field.calculator}» требует блок outputs.`);
  } else {
    reportSetMismatch(
      `${at}: outputs`,
      Object.keys(field.outputs),
      def.outputs,
      errors,
    );
    // Выходы калькулятора пишутся в переменные документа — следим за коллизиями.
    for (const varName of Object.values(field.outputs)) {
      registerVar(varName, field.name, at, producedVars, errors);
    }
  }
}

function validateTextOutput(
  field: FieldConfig,
  prefix: string,
  fieldNames: Set<string>,
  producedVars: Map<string, string>,
  errors: string[],
): void {
  const at = `${prefix}, поле «${field.name}»`;
  const varName = field.text_output as string;

  if (field.type !== "number") {
    errors.push(
      `${at}: text_output допустим только для type: number (сейчас type: ${field.type}).`,
    );
  }
  if (fieldNames.has(varName)) {
    errors.push(
      `${at}: text_output «${varName}» конфликтует с именем другого поля формы.`,
    );
  }
  registerVar(varName, field.name, at, producedVars, errors);
}

/// Регистрирует производную переменную и сообщает о коллизии двух источников.
function registerVar(
  varName: string,
  owner: string,
  at: string,
  producedVars: Map<string, string>,
  errors: string[],
): void {
  const existing = producedVars.get(varName);
  if (existing && existing !== owner) {
    errors.push(
      `${at}: переменная «${varName}» уже заполняется полем «${existing}».`,
    );
    return;
  }
  producedVars.set(varName, owner);
}

/// Сравнивает объявленный в YAML набор ключей с метаданными калькулятора.
function reportSetMismatch(
  at: string,
  declared: string[],
  expected: readonly string[],
  errors: string[],
): void {
  const expectedSet = new Set(expected);
  const declaredSet = new Set(declared);

  const missing = expected.filter((k) => !declaredSet.has(k));
  const extra = declared.filter((k) => !expectedSet.has(k));

  if (missing.length > 0) {
    errors.push(`${at}: не хватает ключей: ${missing.join(", ")}.`);
  }
  if (extra.length > 0) {
    errors.push(`${at}: лишние ключи: ${extra.join(", ")}.`);
  }
}
