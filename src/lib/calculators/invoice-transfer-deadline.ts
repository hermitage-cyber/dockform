import { addBusinessDays } from "@/lib/date-utils";
import { formatRuDate } from "@/lib/format-ru";
import type { CalculatorDef } from "./types";

/**
 * Срок передачи счёта в ОГЗ для служебной записки: 7 рабочих дней от даты
 * подписания документа о приёмке.
 *
 * Раньше юрист вбивал эту дату руками (поле `срок_передачи_счета`, type: date),
 * из-за чего в СЗ уезжал произвольный срок и путалось само его значение —
 * пилот в отзыве 2026-08-10 (п. 2) уточнил, что в записке нужна не дата
 * передачи счёта, а предельная дата оплаты поставки. Теперь считаем.
 *
 * Отсчёт со следующего дня (см. addBusinessDays): день подписания в семь дней
 * не входит. Если календарь праздников не загрузился, ctx.holidays пуст —
 * пропускаются только суббота и воскресенье; так же ведут себя остальные
 * календарные калькуляторы.
 */
const BUSINESS_DAYS = 7;

export const invoiceTransferDeadline: CalculatorDef = {
  id: "invoice_transfer_deadline",
  inputs: ["дата_документа_приемки"],
  outputs: ["срок_передачи_счета"],
  run: (raw, ctx) => {
    const signed = parseDate(raw["дата_документа_приемки"]);
    const deadline = addBusinessDays(signed, BUSINESS_DAYS, ctx?.holidays ?? new Set());
    return {
      "срок_передачи_счета": formatRuDate(deadline),
    };
  },
};

function parseDate(v: unknown): Date {
  if (typeof v !== "string" || v === "") {
    throw new Error("Ожидалась дата в формате YYYY-MM-DD");
  }
  // Принудительно UTC — иначе дата уезжает на сутки в зависимости от таймзоны.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new Error(`Дата «${v}» не в формате YYYY-MM-DD`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) throw new Error(`Некорректная дата «${v}»`);
  return d;
}
