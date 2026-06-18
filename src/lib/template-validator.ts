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
  // Исключение — поля одной variant_group (взаимоисключающая развилка).
  const producedVars = new Map<string, { owner: string; group?: string }>();

  for (const field of template.fields) {
    if (field.type === "calculator") {
      validateCalculatorField(field, prefix, producedVars, errors);
    }
    // != null покрывает и undefined, и null: Rust сериализует пустой
    // Option<String> как text_output: null, а не как отсутствие ключа.
    if (field.text_output != null) {
      validateTextOutput(field, prefix, fieldNames, producedVars, errors);
    }
  }

  validateExtraTemplates(template, prefix, errors);

  return errors;
}

/// Этап 8.8: расширение .docx и отсутствие дублей имён среди доп. документов
/// (включая совпадение с основным). Существование файлов проверяет Rust.
function validateExtraTemplates(
  template: TemplateConfig,
  prefix: string,
  errors: string[],
): void {
  const extras = template.extra_templates;
  if (!extras || extras.length === 0) return;

  const seen = new Set<string>([template.template]);
  for (const extra of extras) {
    if (!extra.template.toLowerCase().endsWith(".docx")) {
      errors.push(`${prefix}: доп. документ «${extra.template}» должен иметь расширение .docx.`);
    }
    if (seen.has(extra.template)) {
      errors.push(`${prefix}: доп. документ «${extra.template}» указан дважды (или совпадает с основным).`);
    } else {
      seen.add(extra.template);
    }
  }
}

function validateCalculatorField(
  field: FieldConfig,
  prefix: string,
  producedVars: Map<string, { owner: string; group?: string }>,
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
      def.optionalInputs,
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
      def.optionalOutputs,
    );
    // Выходы калькулятора пишутся в переменные документа — следим за коллизиями.
    for (const varName of Object.values(field.outputs)) {
      registerVar(varName, field.name, at, producedVars, errors, field.variant_group);
    }
  }
}

function validateTextOutput(
  field: FieldConfig,
  prefix: string,
  fieldNames: Set<string>,
  producedVars: Map<string, { owner: string; group?: string }>,
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
/// Коллизия допустима, если оба поля принадлежат одной непустой variant_group
/// (взаимоисключающая развилка калькуляторов — в шаблоне активен один).
function registerVar(
  varName: string,
  owner: string,
  at: string,
  producedVars: Map<string, { owner: string; group?: string }>,
  errors: string[],
  group?: string,
): void {
  const existing = producedVars.get(varName);
  if (existing && existing.owner !== owner) {
    const sameGroup = group != null && group !== "" && existing.group === group;
    if (!sameGroup) {
      errors.push(
        `${at}: переменная «${varName}» уже заполняется полем «${existing.owner}».`,
      );
    }
    return;
  }
  producedVars.set(varName, { owner, group });
}

/// Сравнивает объявленный в YAML набор ключей с метаданными калькулятора.
/// optional — ключи, отсутствие которых в YAML не считается ошибкой.
function reportSetMismatch(
  at: string,
  declared: string[],
  expected: readonly string[],
  errors: string[],
  optional: readonly string[] = [],
): void {
  const expectedSet = new Set(expected);
  const declaredSet = new Set(declared);
  const optionalSet = new Set(optional);

  const missing = expected.filter(
    (k) => !declaredSet.has(k) && !optionalSet.has(k),
  );
  const extra = declared.filter((k) => !expectedSet.has(k));

  if (missing.length > 0) {
    errors.push(`${at}: не хватает ключей: ${missing.join(", ")}.`);
  }
  if (extra.length > 0) {
    errors.push(`${at}: лишние ключи: ${extra.join(", ")}.`);
  }
}
