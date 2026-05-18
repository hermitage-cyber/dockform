import { describe, expect, it } from "vitest";
import { penaltyContractDailyPercent } from "./penalty-contract-daily-percent";

describe("penalty_contract_daily_percent", () => {
  it("кейс п.8.2 шаблона: 100 000 ₽ × 0,3% × 15 дней", () => {
    const r = penaltyContractDailyPercent.run({
      "сумма_базы": 100_000,
      "процент_в_день": 0.3,
      "дней_просрочки": 15,
    });
    // 100000 × 0.003 = 300/день, × 15 = 4500
    expect(r["пеня_в_день"]).toBe(300);
    expect(r["сумма_неустойки"]).toBe(4_500);
    expect(r["сумма_неустойки_прописью"]).toBe(
      "четыре тысячи пятьсот рублей 00 копеек",
    );
  });

  it("ноль дней просрочки → ноль неустойки", () => {
    const r = penaltyContractDailyPercent.run({
      "сумма_базы": 100_000,
      "процент_в_день": 0.3,
      "дней_просрочки": 0,
    });
    expect(r["сумма_неустойки"]).toBe(0);
    expect(r["сумма_неустойки_прописью"]).toBe("ноль рублей 00 копеек");
  });

  it("ноль базы → ноль неустойки", () => {
    const r = penaltyContractDailyPercent.run({
      "сумма_базы": 0,
      "процент_в_день": 0.3,
      "дней_просрочки": 15,
    });
    expect(r["сумма_неустойки"]).toBe(0);
  });

  it("отрицательные значения бросают ошибку", () => {
    expect(() =>
      penaltyContractDailyPercent.run({
        "сумма_базы": -1,
        "процент_в_день": 0.3,
        "дней_просрочки": 15,
      }),
    ).toThrow(/не могут быть отрицательными/);
  });

  it("нечисловые входы бросают понятную ошибку", () => {
    expect(() =>
      penaltyContractDailyPercent.run({
        "сумма_базы": "не_число",
        "процент_в_день": 0.3,
        "дней_просрочки": 15,
      }),
    ).toThrow(/должны быть числами/);
  });
});
