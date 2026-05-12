import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { readTemplate } from "./tauri";
import type { Mode } from "@/types";

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
