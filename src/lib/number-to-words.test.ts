import { describe, expect, it } from "vitest";
import { numberToWords } from "./number-to-words";
import { DAYS } from "./russian-numerals";

describe("numberToWords", () => {
  it("без послелога — просто число прописью", () => {
    expect(numberToWords(0)).toBe("ноль");
    expect(numberToWords(1)).toBe("один");
    expect(numberToWords(21)).toBe("двадцать один");
    expect(numberToWords(101)).toBe("сто один");
    expect(numberToWords(1000)).toBe("одна тысяча");
  });

  it("с днями — правильные склонения", () => {
    expect(numberToWords(0, DAYS)).toBe("ноль дней");
    expect(numberToWords(1, DAYS)).toBe("один день");
    expect(numberToWords(2, DAYS)).toBe("два дня");
    expect(numberToWords(5, DAYS)).toBe("пять дней");
    expect(numberToWords(11, DAYS)).toBe("одиннадцать дней");
    expect(numberToWords(21, DAYS)).toBe("двадцать один день");
    expect(numberToWords(30, DAYS)).toBe("тридцать дней");
    expect(numberToWords(102, DAYS)).toBe("сто два дня");
  });

  it("округляет дробное до целого", () => {
    expect(numberToWords(2.7, DAYS)).toBe("два дня");
    expect(numberToWords(2.99, DAYS)).toBe("два дня");
  });

  it("отрицательное → префикс «минус»", () => {
    expect(numberToWords(-1, DAYS)).toBe("минус один день");
  });

  it("NaN/Infinity → ошибка", () => {
    expect(() => numberToWords(Number.NaN)).toThrow();
    expect(() => numberToWords(Number.POSITIVE_INFINITY)).toThrow();
  });

  describe("родительный падеж", () => {
    it("числа без послелога", () => {
      expect(numberToWords(0, undefined, "genitive")).toBe("нуля");
      expect(numberToWords(1, undefined, "genitive")).toBe("одного");
      expect(numberToWords(2, undefined, "genitive")).toBe("двух");
      expect(numberToWords(5, undefined, "genitive")).toBe("пяти");
      expect(numberToWords(11, undefined, "genitive")).toBe("одиннадцати");
      expect(numberToWords(21, undefined, "genitive")).toBe("двадцати одного");
      expect(numberToWords(30, undefined, "genitive")).toBe("тридцати");
      expect(numberToWords(40, undefined, "genitive")).toBe("сорока");
      expect(numberToWords(75, undefined, "genitive")).toBe("семидесяти пяти");
      expect(numberToWords(90, undefined, "genitive")).toBe("девяноста");
      expect(numberToWords(100, undefined, "genitive")).toBe("ста");
      expect(numberToWords(101, undefined, "genitive")).toBe("ста одного");
      expect(numberToWords(200, undefined, "genitive")).toBe("двухсот");
      expect(numberToWords(1000, undefined, "genitive")).toBe("одной тысячи");
      expect(numberToWords(2000, undefined, "genitive")).toBe("двух тысяч");
    });

    it("с днями в родительном — «дня/дней/дней»", () => {
      const DAYS_GEN: [string, string, string] = ["дня", "дней", "дней"];
      expect(numberToWords(1, DAYS_GEN, "genitive")).toBe("одного дня");
      expect(numberToWords(2, DAYS_GEN, "genitive")).toBe("двух дней");
      expect(numberToWords(5, DAYS_GEN, "genitive")).toBe("пяти дней");
      expect(numberToWords(21, DAYS_GEN, "genitive")).toBe("двадцати одного дня");
      expect(numberToWords(75, DAYS_GEN, "genitive")).toBe("семидесяти пяти дней");
    });
  });
});
