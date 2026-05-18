import { describeInteger, type GrammaticalCase, type PluralTriple } from "./russian-numerals";

/// Целое число прописью с произвольным послелогом. Округляет до целого.
///
///   numberToWords(30, ["день", "дня", "дней"])             → "тридцать дней"
///   numberToWords(75, undefined, "genitive")                → "семидесяти пяти"
///   numberToWords(75, ["дня", "дней", "дней"], "genitive")  → "семидесяти пяти дней"
///   numberToWords(1)                                        → "один"
///   numberToWords(0, ["день", "дня", "дней"])               → "ноль дней"
///   numberToWords(-3, ["день", "дня", "дней"])              → "минус три дня"
export function numberToWords(
  n: number,
  unit?: PluralTriple,
  gcase: GrammaticalCase = "nominative",
): string {
  if (!Number.isFinite(n)) {
    throw new Error("numberToWords: ожидалось конечное число");
  }
  const negative = n < 0;
  const abs = Math.floor(Math.abs(n));
  const body = describeInteger(abs, { unit: unit ?? null, gcase });
  return negative ? `минус ${body}` : body;
}
