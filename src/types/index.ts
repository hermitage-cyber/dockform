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

export type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
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

