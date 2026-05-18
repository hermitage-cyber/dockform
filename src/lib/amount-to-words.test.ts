import { describe, expect, it } from "vitest";
import { amountToWords } from "./amount-to-words";

describe("amountToWords", () => {
  it("ноль", () => {
    expect(amountToWords(0)).toBe("ноль рублей 00 копеек");
  });

  it("один — singular рубль", () => {
    expect(amountToWords(1)).toBe("один рубль 00 копеек");
  });

  it("два — рубля", () => {
    expect(amountToWords(2)).toBe("два рубля 00 копеек");
  });

  it("пять — рублей", () => {
    expect(amountToWords(5)).toBe("пять рублей 00 копеек");
  });

  it("21 — рубль (10 == 1)", () => {
    expect(amountToWords(21)).toBe("двадцать один рубль 00 копеек");
  });

  it("11 — рублей (11–19 — всегда множественная форма)", () => {
    expect(amountToWords(11)).toBe("одиннадцать рублей 00 копеек");
  });

  it("100", () => {
    expect(amountToWords(100)).toBe("сто рублей 00 копеек");
  });

  it("1000 — feminine «одна тысяча»", () => {
    expect(amountToWords(1000)).toBe("одна тысяча рублей 00 копеек");
  });

  it("2000 — feminine «две тысячи»", () => {
    expect(amountToWords(2000)).toBe("две тысячи рублей 00 копеек");
  });

  it("3451 — singular рубль, женский род у тысячи", () => {
    expect(amountToWords(3451)).toBe(
      "три тысячи четыреста пятьдесят один рубль 00 копеек",
    );
  });

  it("1 234 567 — миллион, тысячи, рубли", () => {
    expect(amountToWords(1_234_567)).toBe(
      "один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь рублей 00 копеек",
    );
  });

  it("дробная часть округляется до копеек", () => {
    expect(amountToWords(3451.5)).toBe(
      "три тысячи четыреста пятьдесят один рубль 50 копеек",
    );
    expect(amountToWords(3451.555)).toBe(
      "три тысячи четыреста пятьдесят один рубль 56 копеек",
    );
  });

  it("копейки с правильным склонением", () => {
    expect(amountToWords(0.01)).toBe("ноль рублей 01 копейка");
    expect(amountToWords(0.02)).toBe("ноль рублей 02 копейки");
    expect(amountToWords(0.05)).toBe("ноль рублей 05 копеек");
    expect(amountToWords(0.11)).toBe("ноль рублей 11 копеек");
  });

  it("отрицательное число → префикс «минус»", () => {
    expect(amountToWords(-5)).toBe("минус пять рублей 00 копеек");
    expect(amountToWords(-1234.56)).toBe(
      "минус одна тысяча двести тридцать четыре рубля 56 копеек",
    );
  });

  it("NaN/Infinity → ошибка", () => {
    expect(() => amountToWords(Number.NaN)).toThrow();
    expect(() => amountToWords(Number.POSITIVE_INFINITY)).toThrow();
  });
});
