import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { buildFilename } from "./filename";
import { readTemplate } from "./tauri";
import type { Mode, TemplateConfig } from "@/types";

/// Читает .docx с диска через Rust и подставляет данные через docxtemplater.
/// Разделители — стандартные одинарные `{` / `}` (так настроен весь проект).
export async function generateDocx(
  mode: Mode,
  templateName: string,
  data: Record<string, unknown>,
): Promise<Uint8Array> {
  const bytes = await readTemplate(mode, templateName);
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Поля, скрытые через visible_if, не приходят в data. Также пустые поля
    // приходят как "". Без nullGetter docxtemplater подставит "undefined".
    nullGetter: () => "",
  });
  doc.render(data);
  const out = doc.getZip().generate({ type: "uint8array" });
  return new Uint8Array(out);
}

export type GeneratedFile = { filename: string; bytes: Uint8Array };

/// Ошибка сборки имени: не заполнены обязательные поля паттерна (хотя бы
/// одного из документов связки). FormPage показывает их пользователю.
export class FilenameFieldsError extends Error {
  constructor(public missing: string[]) {
    super("незаполненные поля для имени файла");
    this.name = "FilenameFieldsError";
  }
}

/// Этап 8.8: генерирует основной документ + все extra_templates из одного и
/// того же набора данных. Сначала собирает все имена (если где-то не хватает
/// обязательных полей — бросает FilenameFieldsError, ничего не рендерит), затем
/// рендерит всё в память. Любое исключение рендера пробрасывается целиком —
/// вызывающий не пишет ни одного файла.
///
/// `filenameValues` — сырые значения формы (для подстановки {поле} в имя),
/// `docxData` — отформатированные значения для подстановки в сам документ.
export async function generateBundle(
  mode: Mode,
  main: TemplateConfig,
  filenameValues: Record<string, unknown>,
  docxData: Record<string, unknown>,
): Promise<GeneratedFile[]> {
  const specs = [
    { template: main.template, output_filename: main.output_filename },
    ...(main.extra_templates ?? []),
  ];

  // Первый проход: имена + проверка обязательных полей по всем документам.
  const names: string[] = [];
  const missing = new Set<string>();
  for (const spec of specs) {
    const fn = buildFilename(
      spec.output_filename.pattern,
      spec.output_filename.fields ?? [],
      filenameValues,
    );
    if (fn.ok) names.push(fn.filename);
    else fn.missing.forEach((m) => missing.add(m));
  }
  if (missing.size > 0) throw new FilenameFieldsError([...missing]);

  // Второй проход: рендер всех в память. Падение здесь = ничего не пишется.
  const files: GeneratedFile[] = [];
  for (let i = 0; i < specs.length; i++) {
    const bytes = await generateDocx(mode, specs[i].template, docxData);
    files.push({ filename: names[i], bytes });
  }
  return files;
}
