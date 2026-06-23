import { formatRubAmount } from "@/lib/format-ru";
import { describeInteger, KOP, plural, RUB } from "@/lib/russian-numerals";
import type { CalculatorDef } from "./types";

/**
 * Неустойка (пеня) по 44-ФЗ, ч. 6 ст. 34: 1/300 ставки рефинансирования ЦБ
 * за каждый день просрочки от не уплаченной в срок суммы.
 *
 *   пеня = (ставка_цб % / 300) × сумма × дней
 *
 * Ставку передаём в процентах (например, 21 — это 21 %).
 * Возвращаем сумму целиком, формулу и разбивку «рубли / копейки / прописью»
 * — последняя нужна шаблонам, где сумма пишется как «32 009 руб. 75 коп.
 * (Тридцать две тысячи девять рублей 75 копеек)». Плюс форматированные база и
 * ставка: сырой type:number подставился бы в .docx с точкой, а конвенция —
 * запятая (см. CLAUDE.md).
 */
export const penalty44FzPart6: CalculatorDef = {
  id: "penalty_44fz_part6",
  inputs: ["сумма_контракта", "дней_просрочки", "ставка_цб"],
  outputs: [
    "сумма_неустойки",
    "расчёт_подробно",
    "сумма_неустойки_руб",
    "сумма_неустойки_коп",
    "сумма_неустойки_прописью",
    "сумма_неустойки_коп_прописью",
    "сумма_базы_формат",
    "ставка_формат",
  ],
  // Парный вывод для парентезы «(… рублей NN копеек)». Старые шаблоны без
  // явного маппинга остаются валидными.
  optionalOutputs: ["сумма_неустойки_коп_прописью"],
  run: (raw) => {
    const sum = Number(raw["сумма_контракта"]);
    const days = Number(raw["дней_просрочки"]);
    const rate = Number(raw["ставка_цб"]);

    if (!Number.isFinite(sum) || !Number.isFinite(days) || !Number.isFinite(rate)) {
      throw new Error("Сумма, дни и ставка должны быть числами");
    }
    if (sum < 0 || days < 0 || rate < 0) {
      throw new Error("Сумма, дни и ставка не могут быть отрицательными");
    }

    const penalty = (rate / 100 / 300) * sum * days;
    const cents = Math.round(penalty * 100);
    const rounded = cents / 100;
    const rub = Math.floor(cents / 100);
    const kop = cents % 100;

    const formula =
      `${formatRubAmount(sum)} ₽ × ${days} дн. × ${formatRate(rate)} % ÷ 300 = ` +
      `${formatRubAmount(rounded)} ₽`;

    // «Четыреста семь рублей» — целое прописью с правильным склонением «рубль/
    // рубля/рублей». С заглавной буквы, потому что подставляется в начало
    // парентезы (… (Четыреста семь рублей 26 копеек)).
    const rubWords = capitalize(describeInteger(rub, { unit: RUB }));
    // «26 копеек» — цифра + склонение «копейка/копейки/копеек».
    const kopWords = `${String(kop).padStart(2, "0")} ${plural(kop, KOP)}`;

    return {
      // Денежные выходы — строки в русской локали (см. CLAUDE.md).
      "сумма_неустойки": formatRubAmount(rounded),
      "расчёт_подробно": formula,
      "сумма_неустойки_руб": rub.toLocaleString("ru-RU"),
      "сумма_неустойки_коп": String(kop).padStart(2, "0"),
      "сумма_неустойки_прописью": rubWords,
      "сумма_неустойки_коп_прописью": kopWords,
      "сумма_базы_формат": formatRubAmount(sum),
      "ставка_формат": formatRate(rate),
    };
  },
};

function formatRate(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
