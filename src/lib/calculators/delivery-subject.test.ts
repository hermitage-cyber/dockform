import { describe, expect, it } from "vitest";
import { deliverySubject } from "./delivery-subject";

const run = (предмет: string) => deliverySubject.run({ предмет });

describe("delivery_subject", () => {
  it("товар — обе формы", () => {
    expect(run("Товар")).toEqual({
      "предмет_род": "Товара",
      "предмет_род_строч": "товара",
    });
  });

  it("оборудование — обе формы", () => {
    expect(run("Оборудование")).toEqual({
      "предмет_род": "Оборудования",
      "предмет_род_строч": "оборудования",
    });
  });

  it("не спотыкается о пробелы по краям", () => {
    expect(run(" Товар ")["предмет_род"]).toBe("Товара");
  });

  it("на неизвестном значении даёт понятную ошибку", () => {
    expect(() => run("Услуги")).toThrow(/Неизвестный предмет/);
    expect(() => run("")).toThrow(/Допустимо/);
  });

  it("контракт inputs/outputs совпадает с реализацией", () => {
    expect(deliverySubject.inputs).toEqual(["предмет"]);
    expect(deliverySubject.outputs).toEqual(["предмет_род", "предмет_род_строч"]);
  });
});
