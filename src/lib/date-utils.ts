// Хелперы для работы с датами в калькуляторах. Все операции — в UTC, чтобы
// не зависеть от таймзоны пользователя (иначе дедлайн может «уехать» на сутки
// при смене зоны).

/// Проверяет, выпадает ли дата на нерабочий день: суббота, воскресенье или
/// официальный праздник из набора `holidays`. Праздники задаются строками
/// `YYYY-MM-DD` — совпадают с форматом, в котором HTML input[type=date]
/// возвращает значение и в котором лежит dictionaries/holidays.json.
export function isNonBusinessDay(d: Date, holidays: ReadonlySet<string>): boolean {
  const dow = d.getUTCDay(); // 0 — вс, 6 — сб
  if (dow === 0 || dow === 6) return true;
  return holidays.has(toIsoUtc(d));
}

/// Если дата выпала на нерабочий день — переносит на ближайший следующий
/// рабочий. По ст. 193 ГК РФ срок исполнения, выпавший на нерабочий день,
/// считается наступившим в ближайший рабочий. Для рабочей даты возвращает её
/// же без изменений (новая копия).
export function shiftToNextBusinessDay(d: Date, holidays: ReadonlySet<string>): Date {
  const r = new Date(d.getTime());
  // Защита от бесконечного цикла: 366 шагов гарантированно выводят из любой
  // цепочки нерабочих дней (теоретический максимум — весь год праздник).
  for (let i = 0; i < 366; i++) {
    if (!isNonBusinessDay(r, holidays)) return r;
    r.setUTCDate(r.getUTCDate() + 1);
  }
  return r;
}

function toIsoUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
