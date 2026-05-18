// Общие справочники и хелперы для записи русских чисел прописью.
// Поддерживаются именительный и родительный падежи: для денежных сумм
// (amount-to-words) всегда именительный, для оборотов «в течение … дней»
// нужен родительный.

export type GrammaticalCase = "nominative" | "genitive";

type CaseMap<T> = Record<GrammaticalCase, T>;

const onesM: CaseMap<string[]> = {
  nominative: ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
  genitive: ["", "одного", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми", "девяти"],
};

const onesF: CaseMap<string[]> = {
  nominative: ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"],
  // 1: «одной тысячи»; 2–4: «двух/трёх/четырёх тысяч»; 5+: «пяти тысяч».
  genitive: ["", "одной", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми", "девяти"],
};

const teensMap: CaseMap<string[]> = {
  nominative: [
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
    "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
  ],
  genitive: [
    "десяти", "одиннадцати", "двенадцати", "тринадцати", "четырнадцати",
    "пятнадцати", "шестнадцати", "семнадцати", "восемнадцати", "девятнадцати",
  ],
};

const tensMap: CaseMap<string[]> = {
  nominative: ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"],
  genitive: ["", "", "двадцати", "тридцати", "сорока", "пятидесяти", "шестидесяти", "семидесяти", "восьмидесяти", "девяноста"],
};

const hundredsMap: CaseMap<string[]> = {
  nominative: ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"],
  genitive: ["", "ста", "двухсот", "трёхсот", "четырёхсот", "пятисот", "шестисот", "семисот", "восьмисот", "девятисот"],
};

export type PluralTriple = [string, string, string];

const THO_FORMS: CaseMap<PluralTriple> = {
  nominative: ["тысяча", "тысячи", "тысяч"],
  genitive: ["тысячи", "тысяч", "тысяч"],
};
const MLN_FORMS: CaseMap<PluralTriple> = {
  nominative: ["миллион", "миллиона", "миллионов"],
  genitive: ["миллиона", "миллионов", "миллионов"],
};
const MLD_FORMS: CaseMap<PluralTriple> = {
  nominative: ["миллиард", "миллиарда", "миллиардов"],
  genitive: ["миллиарда", "миллиардов", "миллиардов"],
};
const TRL_FORMS: CaseMap<PluralTriple> = {
  nominative: ["триллион", "триллиона", "триллионов"],
  genitive: ["триллиона", "триллионов", "триллионов"],
};

/// Триплеты для пользовательских послелогов (день, рубль и т.п.). Для денежных
/// сумм всегда используется именительный.
export const RUB: PluralTriple = ["рубль", "рубля", "рублей"];
export const KOP: PluralTriple = ["копейка", "копейки", "копеек"];
export const DAYS: PluralTriple = ["день", "дня", "дней"];

/// 1 → forms[0], 2..4 → forms[1], всё остальное → forms[2]. С учётом 11..19 → forms[2].
/// Алгоритм одинаков для именительного и родительного — формы передаются снаружи.
export function plural(n: number, forms: PluralTriple): string {
  const n100 = n % 100;
  if (n100 >= 11 && n100 <= 19) return forms[2];
  const n10 = n % 10;
  if (n10 === 1) return forms[0];
  if (n10 >= 2 && n10 <= 4) return forms[1];
  return forms[2];
}

function group3(n: number, feminine: boolean, gcase: GrammaticalCase): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts: string[] = [];
  if (h > 0) parts.push(hundredsMap[gcase][h]);
  if (t === 1) {
    parts.push(teensMap[gcase][u]);
  } else {
    if (t >= 2) parts.push(tensMap[gcase][t]);
    if (u > 0) parts.push((feminine ? onesF : onesM)[gcase][u]);
  }
  return parts.join(" ");
}

/// Раскладывает положительное целое в слова. unit — пользовательский послелог
/// для разряда единиц (день/дня/дней, рубль/...) в нужном падеже; null →
/// без послелога. case — падеж для самих числительных, по умолчанию
/// именительный.
export function describeInteger(
  n: number,
  options: { unit: PluralTriple | null; gcase?: GrammaticalCase },
): string {
  const gcase: GrammaticalCase = options.gcase ?? "nominative";
  if (n === 0) {
    const zero = gcase === "genitive" ? "нуля" : "ноль";
    return options.unit ? `${zero} ${options.unit[2]}` : zero;
  }

  const trillions = Math.floor(n / 1_000_000_000_000);
  const billions = Math.floor((n % 1_000_000_000_000) / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (trillions > 0) {
    parts.push(group3(trillions, false, gcase), plural(trillions, TRL_FORMS[gcase]));
  }
  if (billions > 0) {
    parts.push(group3(billions, false, gcase), plural(billions, MLD_FORMS[gcase]));
  }
  if (millions > 0) {
    parts.push(group3(millions, false, gcase), plural(millions, MLN_FORMS[gcase]));
  }
  if (thousands > 0) {
    parts.push(group3(thousands, true, gcase), plural(thousands, THO_FORMS[gcase]));
  }
  if (units > 0) {
    parts.push(group3(units, false, gcase));
  }
  if (options.unit) {
    parts.push(plural(n, options.unit));
  }
  return parts.join(" ");
}
