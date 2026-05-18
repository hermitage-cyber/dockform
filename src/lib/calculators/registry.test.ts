import { describe, expect, it } from "vitest";
import { CALCULATORS, runCalculator } from "./index";
import type { CalculatorDef } from "./types";

describe("реестр калькуляторов", () => {
  it("неизвестный id бросает понятную ошибку", () => {
    expect(() => runCalculator("nope", {})).toThrow(/не найден в реестре/);
  });

  it("runCalculator возвращает null, если каких-то входов нет", () => {
    const calc: CalculatorDef = {
      id: "test_sum",
      inputs: ["a", "b"],
      outputs: ["sum"],
      run: ({ a, b }) => ({ sum: Number(a) + Number(b) }),
    };
    CALCULATORS["test_sum"] = calc;
    try {
      expect(runCalculator("test_sum", { a: 1 })).toBeNull();
      expect(runCalculator("test_sum", { a: 1, b: "" })).toBeNull();
      expect(runCalculator("test_sum", { a: 1, b: 2 })).toEqual({ sum: 3 });
    } finally {
      delete CALCULATORS["test_sum"];
    }
  });
});
