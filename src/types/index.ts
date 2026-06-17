export type Mode = "pretenzii" | "documentation";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "radio"
  | "dropdown"
  | "dictionary"
  | "date"
  | "calculator";

// Вариант radio/dropdown. Короткая форма — строка (value == подпись).
// Объектная форма разделяет хранимое значение и подпись: например, в .docx
// уходит "Да"/"Нет" (truthy/falsy для условных блоков), а оператор видит «НГ»/«ПП».
export type FieldOption = { value: string; label: string };

export type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: (string | FieldOption)[];
  visible_if?: string;
  placeholder?: string;
  help_text?: string;
  // Поля dictionary — задействуются с этапа 5.
  source?: string;
  display?: string;
  fills?: Record<string, string>;
  // Поля calculator — этап 7. См. src/lib/calculators/.
  // inputs:  имя_входа_калькулятора → имя_поля_формы (откуда взять значение).
  // outputs: имя_выхода_калькулятора → имя_переменной_для_docx (куда положить).
  calculator?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  // display_outputs — этап 7. Список ключей выходов калькулятора (имена слева в
  // outputs), которые показывать оператору в карточке, в этом порядке. Не влияет
  // на то, что пишется в .docx (туда уходят все outputs). Если не задан —
  // показываются все выходы.
  display_outputs?: string[];
  // variant_group — взаимоисключающая развилка калькуляторов (этап 7+).
  // Поля с одинаковым variant_group считаются альтернативами (разводятся через
  // visible_if), и им разрешено писать в одни и те же переменные документа.
  variant_group?: string;
  // text_output — этап 7.5. Применим к type: number.
  // Имя переменной, в которую автоматически записывается значение прописью.
  text_output?: string;
};

export type OutputFilename = {
  pattern: string;
  fields: string[];
};

// Дополнительный документ, генерируемый из той же формы (этап 8.8).
// Переменные общие со всеми документами; код генератора расширять не нужно.
export type ExtraTemplate = {
  template: string; // имя .docx рядом с основным
  output_filename: { pattern: string; fields?: string[] };
};

export type DictionaryRecord = Record<string, string>;
export type Dictionaries = Record<string, DictionaryRecord[]>;

export type TemplateConfig = {
  id: string;
  template: string;
  title: string;
  description?: string;
  output_filename: OutputFilename;
  fields: FieldConfig[];
  // Теги для анкеты-навигатора (этап 8). Ключи — оси анкеты (_wizard.yaml),
  // значения — выбранные варианты ответов. Только для режима «претензии».
  tags?: Record<string, string | number>;
  // Дополнительные документы из той же формы (этап 8.8).
  extra_templates?: ExtraTemplate[];
};

export type {
  WizardAnswers,
  WizardConfig,
  WizardOption,
  WizardQuestion,
} from "./wizard";

