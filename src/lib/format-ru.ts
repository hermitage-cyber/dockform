// Форматирование чисел и дат под русскую юридическую локаль.
// См. CLAUDE.md, секция «Конвенции» — даты «дд.мм.гггг», суммы «1 234,56».
// Используется калькуляторами при формировании выходов, идущих в .docx.

/// Денежная сумма с двумя знаками после запятой: 1234.5 → "1 234,50".
export function formatRubAmount(n: number): string {
  return n.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/// Дата в формате дд.мм.гггг (по UTC, чтобы не уезжать по таймзоне).
export function formatRuDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}
