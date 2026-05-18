import type { CalculatorDef } from "./types";

/**
 * Неустойка (пеня) по 44-ФЗ, ч. 6 ст. 34: 1/300 ставки рефинансирования ЦБ
 * за каждый день просрочки от не уплаченной в срок суммы.
 *
 *   пеня = (ставка_цб % / 300) × сумма × дней
 *
 * Ставку передаём в процентах (например, 21 — это 21 %).
 * Возвращаем сумму и человекочитаемую формулу для подстановки в .docx.
 */
export const penalty44FzPart6: CalculatorDef = {
  id: "penalty_44fz_part6",
  inputs: ["сумма_контракта", "дней_просрочки", "ставка_цб"],
  outputs: ["сумма_неустойки", "расчёт_подробно"],
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
    const rounded = Math.round(penalty * 100) / 100;

    const formula =
      `${formatRub(sum)} × ${days} дн. × ${formatRate(rate)}% ÷ 300 = ` +
      `${formatRub(rounded)}`;

    return {
      сумма_неустойки: rounded,
      расчёт_подробно: formula,
    };
  },
};

function formatRub(n: number): string {
  return `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatRate(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}
