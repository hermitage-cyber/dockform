// Сборка имени файла по pattern из output_filename.
// Подставляет {field} → values[field] и {date} → текущая дата (ГГГГ-ММ-ДД).
// Если какое-то поле из requiredFields пусто — возвращает список пустых полей.

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

  return { ok: true, filename };
}
