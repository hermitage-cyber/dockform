import { describeInteger, KOP, plural, RUB } from "./russian-numerals";

// Денежная сумма прописью на русском.
//   12345.67  → "двенадцать тысяч триста сорок пять рублей 67 копеек"
//   1         → "один рубль 00 копеек"
//   -5.5      → "минус пять рублей 50 копеек"
// Округление: до копеек. Префикс «минус» для отрицательных.

export function amountToWords(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new Error("amountToWords: ожидалось конечное число");
  }
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const rubles = Math.floor(cents / 100);
  const kop = cents % 100;

  const parts: string[] = [];
  if (negative) parts.push("минус");

  // describeInteger сам подставит «рубль/рубля/рублей»
  parts.push(describeInteger(rubles, { unit: RUB }));
  parts.push(kop.toString().padStart(2, "0"));
  parts.push(plural(kop, KOP));

  return parts.join(" ");
}
