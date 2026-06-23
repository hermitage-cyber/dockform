import { shiftToNextBusinessDay } from "@/lib/date-utils";
import { formatRuDate } from "@/lib/format-ru";
import type { CalculatorDef } from "./types";

/**
 * Просрочка, когда дедлайн задан КОНКРЕТНОЙ ДАТОЙ (а не «N дней от договора»).
 *
 *   если дедлайн попал на сб/вс/праздник — сдвигаем на ближайший рабочий
 *   (ст. 193 ГК РФ; применяется и к датам, заданным явно — иначе пеня
 *   начислится за день, в который обязательство исполнить было невозможно).
 *   дней_просрочки = max(0, дата_фактического_исполнения − дата_дедлайна)
 *
 * Парная развилка к delivery_overdue: оба пишут срок_поставки_истек/дней_просрочки
 * в .docx, но в шаблоне активен ровно один (visible_if), а одинаковый
 * variant_group разрешает им делить эти переменные (см. template-validator).
 * Поля даты приходят строками YYYY-MM-DD (тип input=date).
 */
export const overdueFromDeadline: CalculatorDef = {
  id: "overdue_from_deadline",
  inputs: ["дата_дедлайна", "дата_фактического_исполнения"],
  outputs: ["дата_дедлайна_формат", "дней_просрочки"],
  run: (raw, ctx) => {
    const rawDeadline = parseDate(raw["дата_дедлайна"]);
    const dFakt = parseDate(raw["дата_фактического_исполнения"]);

    // ctx.holidays отсутствует — переноса не делаем (фолбэк, если holidays.json
    // не загрузился). См. delivery_overdue для парного поведения.
    const dl = ctx?.holidays
      ? shiftToNextBusinessDay(rawDeadline, ctx.holidays)
      : rawDeadline;

    const msPerDay = 86_400_000;
    // ceil — как в delivery_overdue: поставка «следующим утром» = минимум 1 день.
    const overdueDays = Math.max(0, Math.ceil((dFakt.getTime() - dl.getTime()) / msPerDay));

    return {
      // Дедлайн уже сдвинут (если попал на нерабочий) — отдаём в дд.мм.гггг.
      "дата_дедлайна_формат": formatRuDate(dl),
      "дней_просрочки": overdueDays,
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
