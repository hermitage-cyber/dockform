// Сборка имени файла по pattern из output_filename.
// Подставляет {field} → values[field] и {date} → текущая дата (ГГГГ-ММ-ДД).
// Если какое-то поле из requiredFields пусто — возвращает список пустых полей.

import { normalizeQuotes } from "./format-ru";

export type FilenameResult =
  | { ok: true; filename: string }
  | { ok: false; missing: string[] };

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/// Запрещённые в именах файлов Windows: < > : " / \ | ? * и control chars.
/// Прямые `"` обычно прилетают из ООО "Альфа" — сначала нормализуем их в
/// ёлочки (Windows их разрешает), потом срезаем то, что не выжило.
// eslint-disable-next-line no-control-regex
const WIN_FORBIDDEN = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFilename(name: string): string {
  return normalizeQuotes(name).replace(WIN_FORBIDDEN, "");
}

export function buildFilename(
  pattern: string,
  requiredFields: string[],
  values: Record<string, unknown>,
): FilenameResult {
  const missing = requiredFields.filter((f) => isEmpty(values[f]));
  if (missing.length > 0) return { ok: false, missing };

  const date = formatDate(new Date());
  const filename = pattern.replace(/\{([^}]+)\}/g, (_, name: string) => {
    if (name === "date") return date;
    const v = values[name];
    return isEmpty(v) ? "" : String(v);
  });

  return { ok: true, filename: sanitizeFilename(filename) };
}
