import { amountToWords } from "@/lib/amount-to-words";
import { formatRubAmount } from "@/lib/format-ru";
import type { CalculatorDef } from "./types";

/**
 * Пеня по проценту в день, указанному в договоре.
 *   пеня_в_день = сумма_базы × процент_в_день / 100
 *   сумма_неустойки = пеня_в_день × дней_просрочки
 *
 * Универсальный: процент — вход, а не константа, поэтому подходит и для
 * 0,3% (типичный пункт 8.2), и для 0,1%, и для других значений договора.
 */
export const penaltyContractDailyPercent: CalculatorDef = {
  id: "penalty_contract_daily_percent",
  inputs: ["сумма_базы", "процент_в_день", "дней_просрочки"],
  outputs: ["пеня_в_день", "сумма_неустойки", "сумма_неустойки_прописью"],
  run: (raw) => {
    const sum = Number(raw["сумма_базы"]);
    const pct = Number(raw["процент_в_день"]);
    const days = Number(raw["дней_просрочки"]);

    if (!Number.isFinite(sum) || !Number.isFinite(pct) || !Number.isFinite(days)) {
      throw new Error("Сумма, процент и дни должны быть числами");
    }
    if (sum < 0 || pct < 0 || days < 0) {
      throw new Error("Сумма, процент и дни не могут быть отрицательными");
    }

    const perDay = Math.round((sum * pct) / 100 * 100) / 100;
    const total = Math.round(perDay * days * 100) / 100;

    return {
      // Денежные выходы — строки в русской локали (см. CLAUDE.md, конвенции).
      "пеня_в_день": formatRubAmount(perDay),
      "сумма_неустойки": formatRubAmount(total),
      "сумма_неустойки_прописью": amountToWords(total),
    };
  },
};
