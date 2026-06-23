import { readHolidays } from "@/lib/tauri";

// Кешируем загрузку: holidays.json не меняется в течение сессии (обновится
// через manifest при следующем старте), а CalculatorField монтируется на
// каждой форме — без кеша били бы Rust-команду по разу на каждый калькулятор.
let cache: ReadonlySet<string> | null = null;
let pending: Promise<ReadonlySet<string>> | null = null;

/// Возвращает набор нерабочих праздничных дней (YYYY-MM-DD). Пустой Set, если
/// файл недоступен — калькуляторы в этом случае переносят только сб/вс.
export async function getHolidays(): Promise<ReadonlySet<string>> {
  if (cache) return cache;
  if (pending) return pending;
  pending = readHolidays()
    .then((list) => {
      cache = new Set(list);
      return cache;
    })
    .catch(() => {
      cache = new Set();
      return cache;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
