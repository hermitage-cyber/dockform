import type {
  CalculatorContext,
  CalculatorDef,
  CalculatorInputs,
  CalculatorOutputs,
} from "./types";
import { deliveryOverdue } from "./delivery-overdue";
import { overdueFromDeadline } from "./overdue-from-deadline";
import { penalty44FzPart6 } from "./penalty-44fz-part6";
import { penalty44FzPartial } from "./penalty-44fz-partial";
import { penaltyContractDailyPercent } from "./penalty-contract-daily-percent";

/**
 * Реестр калькуляторов. Универсальные и специфичные под шаблон лежат здесь
 * одинаково — разница только в области применения (см. plan.md этап 7.2).
 *
 * Новый калькулятор: добавить файл `<id>.ts` рядом, экспортнуть CalculatorDef,
 * импортнуть и зарегистрировать ниже.
 */
export const CALCULATORS: Record<string, CalculatorDef> = {
  [deliveryOverdue.id]: deliveryOverdue,
  [overdueFromDeadline.id]: overdueFromDeadline,
  [penalty44FzPart6.id]: penalty44FzPart6,
  [penalty44FzPartial.id]: penalty44FzPartial,
  [penaltyContractDailyPercent.id]: penaltyContractDailyPercent,
};

/**
 * Запускает калькулятор по id. Возвращает null, если каких-то ожидаемых входов
 * нет (null/undefined/пустая строка) — это значит, что форма ещё не заполнена,
 * UI покажет заглушку «Заполните поля выше».
 *
 * Если калькулятор бросил исключение — пробрасывается наружу, обрабатывается
 * на уровне формы (показ ошибки в превью, переменные outputs остаются пустыми).
 */
export function runCalculator(
  id: string,
  raw: CalculatorInputs,
  ctx?: CalculatorContext,
): CalculatorOutputs | null {
  const def = CALCULATORS[id];
  if (!def) {
    throw new Error(`Калькулятор «${id}» не найден в реестре.`);
  }
  const optional = new Set(def.optionalInputs ?? []);
  for (const key of def.inputs) {
    if (optional.has(key)) continue; // опциональный вход не обязателен
    const v = raw[key];
    if (v == null || v === "") return null;
  }
  return def.run(raw, ctx);
}

export function getCalculator(id: string): CalculatorDef | undefined {
  return CALCULATORS[id];
}

export type {
  CalculatorContext,
  CalculatorDef,
  CalculatorInputs,
  CalculatorOutputs,
} from "./types";
