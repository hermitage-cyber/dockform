// Запись денежной суммы прописью на русском. Отдельный модуль без зависимостей,
// чтобы не тянуть npm-пакет ради ~80 строк специфики языка.
//
// Поведение:
//   12345.67  → "двенадцать тысяч триста сорок пять рублей 67 копеек"
//   1         → "один рубль 00 копеек"
//   2         → "два рубля 00 копеек"
//   0         → "ноль рублей 00 копеек"
//   -5.5      → "минус пять рублей 50 копеек"
//
// Округление: до копеек (две цифры после запятой).
// Тысячи — женского рода («одна тысяча», «две тысячи»);
// миллионы/миллиарды/триллионы — мужского.

const ones = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];

const onesFem = [
  "",
  "одна",
  "две",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];

const teens = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];

const tens = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];

const hundreds = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

type Triple = [string, string, string];

const RUB: Triple = ["рубль", "рубля", "рублей"];
const KOP: Triple = ["копейка", "копейки", "копеек"];
const THO: Triple = ["тысяча", "тысячи", "тысяч"];
const MLN: Triple = ["миллион", "миллиона", "миллионов"];
const MLD: Triple = ["миллиард", "миллиарда", "миллиардов"];
const TRL: Triple = ["триллион", "триллиона", "триллионов"];

function plural(n: number, forms: Triple): string {
  const n100 = n % 100;
  if (n100 >= 11 && n100 <= 19) return forms[2];
  const n10 = n % 10;
  if (n10 === 1) return forms[0];
  if (n10 >= 2 && n10 <= 4) return forms[1];
  return forms[2];
}

function group3(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts: string[] = [];
  if (h > 0) parts.push(hundreds[h]);
  if (t === 1) {
    parts.push(teens[u]);
  } else {
    if (t >= 2) parts.push(tens[t]);
    if (u > 0) parts.push(feminine ? onesFem[u] : ones[u]);
  }
  return parts.join(" ");
}

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

  if (rubles === 0) {
    parts.push("ноль");
  } else {
    const trillions = Math.floor(rubles / 1_000_000_000_000);
    const billions = Math.floor((rubles % 1_000_000_000_000) / 1_000_000_000);
    const millions = Math.floor((rubles % 1_000_000_000) / 1_000_000);
    const thousands = Math.floor((rubles % 1_000_000) / 1_000);
    const units = rubles % 1_000;

    if (trillions > 0) {
      parts.push(group3(trillions, false), plural(trillions, TRL));
    }
    if (billions > 0) {
      parts.push(group3(billions, false), plural(billions, MLD));
    }
    if (millions > 0) {
      parts.push(group3(millions, false), plural(millions, MLN));
    }
    if (thousands > 0) {
      parts.push(group3(thousands, true), plural(thousands, THO));
    }
    if (units > 0) {
      parts.push(group3(units, false));
    }
  }
  parts.push(plural(rubles, RUB));

  parts.push(kop.toString().padStart(2, "0"));
  parts.push(plural(kop, KOP));

  return parts.join(" ");
}
