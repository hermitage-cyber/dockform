import { formatRuDate } from "@/lib/format-ru";
import { numberToWords } from "@/lib/number-to-words";
import type { CalculatorDef } from "./types";

/**
 * Дедлайн поставки/исполнения и просрочка по договору.
 *
 *   дата_дедлайна = дата_договора + срок_исполнения_дней
 *   дней_просрочки = max(0, дата_фактического_исполнения − дата_дедлайна)
 *
 * Универсальный — подходит для любого договора с днями-сроком.
 * Поля даты приходят строками YYYY-MM-DD (тип input=date).
 */
export const deliveryOverdue: CalculatorDef = {
  id: "delivery_overdue",
  inputs: ["дата_договора", "срок_исполнения_дней", "дата_фактического_исполнения"],
  outputs: ["дата_дедлайна", "дней_просрочки", "срок_исполнения_прописью"],
  run: (raw) => {
    const dDog = parseDate(raw["дата_договора"]);
    const days = Number(raw["срок_исполнения_дней"]);
    const dFakt = parseDate(raw["дата_фактического_исполнения"]);

    if (!Number.isFinite(days)) {
      throw new Error("Срок исполнения должен быть числом");
    }
    if (days < 0) {
      throw new Error("Срок исполнения не может быть отрицательным");
    }

    const dl = addDays(dDog, days);

    const msPerDay = 86_400_000;
    // ceil — чтобы поставка «следующим утром» давала минимум 1 день просрочки.
    // Для одного календарного дня просрочки нужно фактически выйти за дедлайн.
    const overdueDays = Math.max(0, Math.ceil((dFakt.getTime() - dl.getTime()) / msPerDay));

    return {
      "дата_дедлайна": formatRuDate(dl),
      "дней_просрочки": overdueDays,
      // Родительный падеж без послелога: в .docx уже стоит «… (X) дней».
      // 30 → «тридцати», 75 → «семидесяти пяти», 21 → «двадцати одного».
      "срок_исполнения_прописью": numberToWords(days, undefined, "genitive"),
    };
  },
};

function parseDate(v: unknown): Date {
  if (typeof v !== "string" || v === "") {
    throw new Error("Ожидалась дата в формате YYYY-MM-DD");
  }
  // Принудительно UTC, чтобы избежать сдвига по таймзоне при разнице дат на сутки.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new Error(`Дата «${v}» не в формате YYYY-MM-DD`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new Error(`Некорректная дата «${v}»`);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + Math.floor(n));
  return r;
}
