import { formatRubAmount } from "@/lib/format-ru";
import { describeInteger } from "@/lib/russian-numerals";
import type { CalculatorDef } from "./types";

/**
 * Неустойка (пеня) по 44-ФЗ при ранее произведённых частичных поставках —
 * обобщённый калькулятор на 1–4 поставки. От числа поставок меняется только
 * сумма исполненного (одно слагаемое), поэтому поставки 2..4 — опциональны:
 * шаблон на 1 поставку маппит только поставка1_*, на 3 — поставка1..3 и т.д.
 *
 *   база = цена_контракта − (поставка1 + поставка2 + поставка3 + поставка4)
 *   пеня = (ставка_цб % / 300) × база × дней
 *
 * Отсутствующие поставки трактуются как 0. Каждая поставка форматируется в
 * выход поставкаN_формат (для перечня и формулы в .docx). База = остаток =
 * сумма текущей (просроченной) поставки — идёт в «на сумму … руб.».
 * Дни приходят извне (overdue_from_deadline: от даты последней поставки до
 * текущей). Конвенция запятой — см. CLAUDE.md.
 */
export const penalty44FzPartial: CalculatorDef = {
  id: "penalty_44fz_partial",
  inputs: [
    "цена_контракта",
    "поставка1_сумма",
    "поставка2_сумма",
    "поставка3_сумма",
    "поставка4_сумма",
    "дней_просрочки",
    "ставка_цб",
  ],
  optionalInputs: ["поставка2_сумма", "поставка3_сумма", "поставка4_сумма"],
  outputs: [
    "сумма_неустойки",
    "расчёт_подробно",
    "сумма_неустойки_руб",
    "сумма_неустойки_коп",
    "сумма_неустойки_прописью",
    "цена_формат",
    "поставка1_формат",
    "поставка2_формат",
    "поставка3_формат",
    "поставка4_формат",
    "база_формат",
    "ставка_формат",
  ],
  optionalOutputs: ["поставка2_формат", "поставка3_формат", "поставка4_формат"],
  run: (raw) => {
    const price = num(raw["цена_контракта"], "Цена контракта");
    const days = num(raw["дней_просрочки"], "Дни просрочки");
    const rate = num(raw["ставка_цб"], "Ставка");
    // поставка1 — обязательна; 2..4 опциональны (отсутствие → 0).
    const p = [1, 2, 3, 4].map((i) =>
      numOrZero(raw[`поставка${i}_сумма`], `Сумма поставки №${i}`),
    );
    p[0] = num(raw["поставка1_сумма"], "Сумма поставки №1");

    if ([price, days, rate].some((n) => n < 0) || p.some((n) => n < 0)) {
      throw new Error("Цена, суммы, дни и ставка не могут быть отрицательными");
    }

    const executed = p[0] + p[1] + p[2] + p[3];
    const base = price - executed;
    if (base < 0) {
      throw new Error("Сумма исполненного больше цены контракта — проверьте суммы поставок");
    }

    const penalty = (rate / 100 / 300) * base * days;
    const cents = Math.round(penalty * 100);
    const rounded = cents / 100;
    const rub = Math.floor(cents / 100);
    const kop = cents % 100;

    const formula =
      `(${formatRubAmount(price)} − ${formatRubAmount(executed)}) ₽ × ` +
      `${days} дн. × ${formatRate(rate)} % ÷ 300 = ${formatRubAmount(rounded)} ₽`;

    return {
      // Денежные выходы — строки в русской локали (см. CLAUDE.md).
      "сумма_неустойки": formatRubAmount(rounded),
      "расчёт_подробно": formula,
      "сумма_неустойки_руб": rub.toLocaleString("ru-RU"),
      "сумма_неустойки_коп": String(kop).padStart(2, "0"),
      "сумма_неустойки_прописью": capitalize(describeInteger(rub, { unit: null })),
      "цена_формат": formatRubAmount(price),
      "поставка1_формат": formatRubAmount(p[0]),
      "поставка2_формат": formatRubAmount(p[1]),
      "поставка3_формат": formatRubAmount(p[2]),
      "поставка4_формат": formatRubAmount(p[3]),
      "база_формат": formatRubAmount(base),
      "ставка_формат": formatRate(rate),
    };
  },
};

function num(v: unknown, what: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${what}: ожидалось число`);
  return n;
}

function numOrZero(v: unknown, what: string): number {
  if (v == null || v === "") return 0;
  return num(v, what);
}

function formatRate(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
