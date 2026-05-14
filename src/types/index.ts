export type Mode = "pretenzii" | "documentation";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "radio"
  | "dropdown"
  | "dictionary"
  | "date";

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
};

export type OutputFilename = {
  pattern: string;
  fields: string[];
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
};

