import { describe, expect, it } from "vitest";
import { isNonBusinessDay, shiftToNextBusinessDay } from "./date-utils";

// Чтобы не дублировать набор в каждом тесте — фиксированный календарь под кейсы.
// 2026-01-01..08 — новогодние, 2026-02-23 — праздник в пн, 2026-03-08 — праздник в вс,
// 2026-03-09 — перенос, 2026-05-09 — праздник в сб, 2026-05-11 — перенос.
const HOLIDAYS = new Set<string>([
  "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
  "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08",
  "2026-02-23",
  "2026-03-08", "2026-03-09",
  "2026-05-09", "2026-05-11",
]);

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

describe("isNonBusinessDay", () => {
  it("суббота — нерабочий", () => {
    expect(isNonBusinessDay(utc("2026-02-21"), HOLIDAYS)).toBe(true); // сб
  });
  it("воскресенье — нерабочий", () => {
    expect(isNonBusinessDay(utc("2026-02-22"), HOLIDAYS)).toBe(true); // вс
  });
  it("обычный будний — рабочий", () => {
    expect(isNonBusinessDay(utc("2026-02-20"), HOLIDAYS)).toBe(false); // пт
  });
  it("праздник в будний день — нерабочий", () => {
    expect(isNonBusinessDay(utc("2026-02-23"), HOLIDAYS)).toBe(true); // пн, праздник
  });
});

describe("shiftToNextBusinessDay", () => {
  it("будний день остаётся собой", () => {
    const r = shiftToNextBusinessDay(utc("2026-02-20"), HOLIDAYS); // пт
    expect(iso(r)).toBe("2026-02-20");
  });

  it("суббота → понедельник", () => {
    const r = shiftToNextBusinessDay(utc("2026-02-21"), HOLIDAYS);
    expect(iso(r)).toBe("2026-02-24"); // 22 вс, 23 праздник, 24 вт ← первый рабочий
  });

  it("воскресенье → следующий рабочий с учётом праздника понедельника", () => {
    const r = shiftToNextBusinessDay(utc("2026-02-22"), HOLIDAYS); // вс, 23 — праздник
    expect(iso(r)).toBe("2026-02-24");
  });

  it("праздник в будний → следующий будний", () => {
    const r = shiftToNextBusinessDay(utc("2026-02-23"), HOLIDAYS); // пн-праздник
    expect(iso(r)).toBe("2026-02-24");
  });

  it("цепочка новогодних: 1 января → 9 января", () => {
    const r = shiftToNextBusinessDay(utc("2026-01-01"), HOLIDAYS);
    // 1..8 января — праздники, 9 января 2026 — пятница (рабочая)
    expect(iso(r)).toBe("2026-01-09");
  });

  it("8 марта (вс) + перенос 9 марта (пн) → 10 марта (вт)", () => {
    const r = shiftToNextBusinessDay(utc("2026-03-08"), HOLIDAYS);
    expect(iso(r)).toBe("2026-03-10");
  });

  it("9 мая (сб) + перенос 11 мая (пн) → 12 мая (вт)", () => {
    const r = shiftToNextBusinessDay(utc("2026-05-09"), HOLIDAYS);
    // 10 мая вс, 11 мая праздник-перенос, 12 мая вт ← рабочий
    expect(iso(r)).toBe("2026-05-12");
  });

  it("пустой набор праздников — переносит только сб/вс", () => {
    const r = shiftToNextBusinessDay(utc("2026-02-21"), new Set()); // сб
    expect(iso(r)).toBe("2026-02-23"); // пн
  });

  it("исходная дата не мутируется", () => {
    const src = utc("2026-02-21");
    const before = src.getTime();
    shiftToNextBusinessDay(src, HOLIDAYS);
    expect(src.getTime()).toBe(before);
  });
});
