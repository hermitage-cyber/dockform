// Минимальный парсер выражений видимости поля. Поддерживает только три формы,
// без скобок/AND/OR — в юридических шаблонах этого достаточно.
//
// Формы:
//   "поле == 'значение'"   — равенство по строке
//   "поле != 'значение'"   — неравенство
//   "поле"                 — truthy (непустая строка, true, число != 0)

export type FormValues = Record<string, unknown>;

const COMPARE_RE = /^\s*(\S+)\s*(==|!=)\s*['"](.*)['"]\s*$/;

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0 && value !== "Нет";
  if (typeof value === "number") return value !== 0;
  if (typeof value === "boolean") return value;
  return Boolean(value);
}

export function evaluateVisibility(expr: string | undefined, values: FormValues): boolean {
  if (!expr || !expr.trim()) return true;

  const m = expr.match(COMPARE_RE);
  if (m) {
    const [, field, op, expected] = m;
    const actual = values[field];
    const actualStr = actual === undefined || actual === null ? "" : String(actual);
    return op === "==" ? actualStr === expected : actualStr !== expected;
  }

  // Третий случай: голое имя поля → truthy-проверка.
  return isTruthy(values[expr.trim()]);
}
